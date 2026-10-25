const http = require('node:http');

const database = {
  students: [],
  teachers: [],
  attendance: [],
  marks: []
};

const nextIds = {
  students: 1,
  teachers: 1,
  attendance: 1,
  marks: 1
};

const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json'
    });
    res.end(JSON.stringify(body));
  };

  const parts = new URL(req.url, 'http://localhost')
    .pathname.split('/').filter(Boolean);

  const moduleName = parts[0];

  if (!Object.hasOwn(database, moduleName) || parts.length > 2) {
    return send(404, { error: 'Route not found' });
  }

  let id;

  if (parts.length === 2) {
    id = Number(parts[1]);

    if (!Number.isSafeInteger(id) || id < 1) {
      return send(400, { error: 'Invalid ID' });
    }
  }

  const records = database[moduleName];

  const index = id === undefined
    ? -1
    : records.findIndex(item => item.id === id);

  // READ
  if (req.method === 'GET') {
    if (id === undefined) {
      return send(200, records);
    }

    if (index === -1) {
      return send(404, { error: 'Record not found' });
    }

    return send(200, records[index]);
  }

  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return send(405, { error: 'Method not allowed' });
  }

  if (req.method === 'POST' && id !== undefined) {
    return send(405, { error: 'Use POST on collection URL' });
  }

  if (req.method !== 'POST' && id === undefined) {
    return send(405, { error: 'ID required' });
  }

  if (req.method !== 'POST' && index === -1) {
    return send(404, { error: 'Record not found' });
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (moduleName === 'students') {
      const hasAttendance = database.attendance.some(
        item => item.studentId === id
      );

      const hasMarks = database.marks.some(
        item => item.studentId === id
      );

      if (hasAttendance || hasMarks) {
        return send(409, {
          error: 'Remove student attendance and marks first'
        });
      }
    }

    records.splice(index, 1);

    return send(200, {
      message: 'Deleted successfully'
    });
  }

  // CREATE AND UPDATE
  try {
    let raw = '';

    for await (const chunk of req) {
      raw += chunk;

      if (Buffer.byteLength(raw) > 65536) {
        return send(413, { error: 'Too large' });
      }
    }

    const data = JSON.parse(raw);

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return send(400, { error: 'JSON object required' });
    }

    const allowed = {
      students: ['name', 'className'],
      teachers: ['name', 'subject'],
      attendance: ['studentId', 'date', 'status'],
      marks: ['studentId', 'subject', 'score']
    }[moduleName];

    if (Object.keys(data).some(key => !allowed.includes(key))) {
      return send(400, {
        error: `Allowed fields: ${allowed.join(', ')}`
      });
    }

    const item = req.method === 'POST'
      ? { ...data }
      : { ...records[index], ...data };

    // STUDENT AND TEACHER VALIDATION
    if (moduleName === 'students' || moduleName === 'teachers') {
      const fields = moduleName === 'students'
        ? ['name', 'className']
        : ['name', 'subject'];

      for (const field of fields) {
        if (typeof item[field] !== 'string' || !item[field].trim()) {
          return send(400, {
            error: `${field} is required`
          });
        }

        item[field] = item[field].trim();
      }
    }

    // STUDENT ID VALIDATION
    if (moduleName === 'attendance' || moduleName === 'marks') {
      const exists = database.students.some(
        student => student.id === item.studentId
      );

      if (!Number.isSafeInteger(item.studentId) || !exists) {
        return send(400, {
          error: 'Valid existing studentId required'
        });
      }
    }

    // ATTENDANCE VALIDATION
    if (moduleName === 'attendance') {
      const validFormat =
        typeof item.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date);

      if (!validFormat ||
          Number.isNaN(Date.parse(item.date)) ||
          new Date(item.date).toISOString().slice(0, 10) !== item.date) {
        return send(400, {
          error: 'Valid YYYY-MM-DD date required'
        });
      }

      if (!['Present', 'Absent', 'Late'].includes(item.status)) {
        return send(400, {
          error: 'Status must be Present, Absent, or Late'
        });
      }
    }

    // MARKS VALIDATION
    if (moduleName === 'marks') {
      if (typeof item.subject !== 'string' || !item.subject.trim()) {
        return send(400, {
          error: 'Subject required'
        });
      }

      item.subject = item.subject.trim();

      if (typeof item.score !== 'number' ||
          !Number.isFinite(item.score) ||
          item.score < 0 || item.score > 100) {
        return send(400, {
          error: 'Score must be between 0 and 100'
        });
      }
    }

    // POST
    if (req.method === 'POST') {
      item.id = nextIds[moduleName]++;
      records.push(item);

      return send(201, item);
    }

    // PUT
    item.id = id;
    records[index] = item;

    return send(200, item);

  } catch (error) {
    if (error instanceof SyntaxError) {
      return send(400, { error: 'Invalid JSON' });
    }

    console.error(error);
    return send(500, { error: 'Server error' });
  }
});

server.listen(3004, () => {
  console.log('Student Management API running at http://localhost:3004');
});