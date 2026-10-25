const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

if (!SECRET) {
  console.error("Please set JWT_SECRET in the .env file");
  process.exit(1);
}

// Persistent JSON storage
const dataFolder = path.join(__dirname, "data");
const dataFile = path.join(dataFolder, "store.json");

const startingProducts = [
  { id: 1, game: "Valorant", name: "2,050 Valorant Points", category: "FPS", price: 5490 },
  { id: 2, game: "Call of Duty", name: "2,400 COD Points", category: "FPS", price: 5650 },
  { id: 3, game: "Apex Legends", name: "2,250 Apex Coins", category: "FPS", price: 5250 },
  { id: 4, game: "Rainbow Six Siege", name: "2,670 R6 Credits", category: "FPS", price: 6190 },
  { id: 5, game: "Fortnite", name: "2,800 V-Bucks", category: "FPS", price: 6450 },
  { id: 6, game: "Overwatch 2", name: "2,200 Overwatch Coins", category: "FPS", price: 5590 },
  { id: 7, game: "Counter-Strike 2", name: "Steam Wallet Credit", category: "FPS", price: 5000 },
  { id: 8, game: "League of Legends", name: "2,800 RP", category: "MOBA", price: 6250 },
  { id: 9, game: "Dota 2", name: "Dota Plus - 1 Month", category: "MOBA", price: 1150 },
  { id: 10, game: "Rocket League", name: "3,000 Credits", category: "Sports", price: 6950 },
  { id: 11, game: "EA SPORTS FC 26", name: "2,800 FC Points", category: "Sports", price: 7250 }
];

if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
}

if (!fs.existsSync(dataFile)) {
  const initialData = {
    users: [],
    products: startingProducts,
    reviews: [],
    carts: {},
    orders: []
  };

  fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2));
}

function readData() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

function saveData(data) {
  const tempFile = dataFile + ".tmp";
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, dataFile);
}

function nextId(items) {
  return Math.max(0, ...items.map(item => item.id)) + 1;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

// Middleware: verify login token
function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Login required" });
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, SECRET);

    const data = readData();
    const user = data.users.find(u => u.id === decoded.userId);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Homepage
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Lootify API",
    endpoints: "/api"
  });
});

// API information
app.get("/api", (req, res) => {
  res.json({
    message: "Lootify Persistent REST API",
    endpoints: [
      "POST /api/signup",
      "POST /api/login",
      "GET /api/products",
      "GET /api/products/:id",
      "POST /api/products",
      "PUT /api/products/:id",
      "DELETE /api/products/:id",
      "GET /api/reviews",
      "POST /api/reviews",
      "GET /api/cart",
      "POST /api/cart",
      "PUT /api/cart/:productId",
      "DELETE /api/cart/:productId",
      "DELETE /api/cart",
      "POST /api/checkout",
      "GET /api/orders",
      "GET /api/orders/:id"
    ]
  });
});

// ---------------- SIGNUP ----------------

app.post("/api/signup", async (req, res) => {
  const { email, username, password, confirmPassword } = req.body;

  if (!email || !username || !password || !confirmPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const data = readData();

  const exists = data.users.some(
    u => u.email.toLowerCase() === email.toLowerCase() ||
         u.username.toLowerCase() === username.toLowerCase()
  );

  if (exists) {
    return res.status(409).json({ error: "Email or username already exists" });
  }

  const user = {
    id: nextId(data.users),
    email: email.trim(),
    username: username.trim(),
    password: await bcrypt.hash(password, 10)
  };

  data.users.push(user);
  saveData(data);

  const token = jwt.sign({ userId: user.id }, SECRET, {
    expiresIn: "1d"
  });

  res.status(201).json({
    message: "Account created successfully",
    user: {
      id: user.id,
      email: user.email,
      username: user.username
    },
    token
  });
});

// ---------------- LOGIN ----------------

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const data = readData();

  const user = data.users.find(
    u => u.username.toLowerCase() === username.toLowerCase()
  );

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = jwt.sign({ userId: user.id }, SECRET, {
    expiresIn: "1d"
  });

  res.json({
    message: "Login successful",
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    },
    token
  });
});

// ---------------- PRODUCTS ----------------

// Get all products, with optional search and category filters
app.get("/api/products", (req, res) => {
  const data = readData();
  let products = data.products;

  if (req.query.search) {
    const search = String(req.query.search).toLowerCase();
    products = products.filter(
      p => p.game.toLowerCase().includes(search) ||
           p.name.toLowerCase().includes(search)
    );
  }

  if (req.query.category) {
    products = products.filter(
      p => p.category.toLowerCase() ===
           String(req.query.category).toLowerCase()
    );
  }

  res.json(products);
});

// Get one product
app.get("/api/products/:id", (req, res) => {
  const data = readData();
  const product = data.products.find(p => p.id === Number(req.params.id));

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json(product);
});

// Add a product
app.post("/api/products", authenticate, (req, res) => {
  const { game, name, category, price } = req.body;

  if (!game || !name || !category ||
      typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: "Valid product details required" });
  }

  const data = readData();

  const product = {
    id: nextId(data.products),
    game,
    name,
    category,
    price
  };

  data.products.push(product);
  saveData(data);

  res.status(201).json({
    message: "Product added successfully",
    product
  });
});

// Update a product
app.put("/api/products/:id", authenticate, (req, res) => {
  const data = readData();
  const product = data.products.find(p => p.id === Number(req.params.id));

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const { game, name, category, price } = req.body;

  if (game !== undefined && (typeof game !== "string" || !game.trim()) ||
      name !== undefined && (typeof name !== "string" || !name.trim()) ||
      category !== undefined && (typeof category !== "string" || !category.trim()) ||
      price !== undefined && (typeof price !== "number" ||
        !Number.isFinite(price) || price <= 0)) {
    return res.status(400).json({ error: "Invalid product details" });
  }

  if (game !== undefined) product.game = game;
  if (name !== undefined) product.name = name;
  if (category !== undefined) product.category = category;
  if (price !== undefined) product.price = price;

  saveData(data);

  res.json({
    message: "Product updated successfully",
    product
  });
});

// Delete a product
app.delete("/api/products/:id", authenticate, (req, res) => {
  const data = readData();
  const id = Number(req.params.id);

  const index = data.products.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Product not found" });
  }

  data.products.splice(index, 1);

  // Remove deleted product from shopping carts
  for (const userId of Object.keys(data.carts)) {
    data.carts[userId] = data.carts[userId].filter(
      item => item.productId !== id
    );
  }

  saveData(data);

  res.json({ message: "Product deleted successfully" });
});

// ---------------- REVIEWS ----------------

// Get all reviews
app.get("/api/reviews", (req, res) => {
  const data = readData();
  res.json(data.reviews);
});

// Create review
app.post("/api/reviews", authenticate, (req, res) => {
  const { rating, comment } = req.body;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5 ||
      typeof comment !== "string" || !comment.trim()) {
    return res.status(400).json({
      error: "Rating must be 1-5 and comment is required"
    });
  }

  const data = readData();

  const review = {
    id: nextId(data.reviews),
    userId: req.user.id,
    username: req.user.username,
    rating,
    comment: comment.trim(),
    createdAt: new Date().toISOString()
  };

  data.reviews.push(review);
  saveData(data);

  res.status(201).json({
    message: "Review added successfully",
    review
  });
});

// ---------------- CART ----------------

function getUserCart(data, userId) {
  const key = String(userId);

  if (!data.carts[key]) {
    data.carts[key] = [];
  }

  return data.carts[key];
}

// Display cart
app.get("/api/cart", authenticate, (req, res) => {
  const data = readData();
  const cart = getUserCart(data, req.user.id);

  const items = cart.map(item => {
    const product = data.products.find(p => p.id === item.productId);

    if (!product) return null;

    return {
      productId: product.id,
      name: product.name,
      game: product.game,
      price: product.price,
      quantity: item.quantity,
      total: product.price * item.quantity
    };
  }).filter(Boolean);

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const serviceFee = items.length > 0 ? 100 : 0;

  res.json({
    items,
    subtotal,
    serviceFee,
    total: subtotal + serviceFee
  });
});

// Add product to cart
app.post("/api/cart", authenticate, (req, res) => {
  const { productId, quantity = 1 } = req.body;

  if (!positiveInteger(productId) || !positiveInteger(quantity)) {
    return res.status(400).json({ error: "Invalid product ID or quantity" });
  }

  const data = readData();
  const product = data.products.find(p => p.id === productId);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const cart = getUserCart(data, req.user.id);
  const item = cart.find(i => i.productId === productId);

  if (item) {
    item.quantity += quantity;
  } else {
    cart.push({ productId, quantity });
  }

  saveData(data);

  res.status(201).json({
    message: "Product added to cart",
    cart
  });
});

// Update cart quantity
app.put("/api/cart/:productId", authenticate, (req, res) => {
  const { quantity } = req.body;

  if (!positiveInteger(quantity)) {
    return res.status(400).json({ error: "Invalid quantity" });
  }

  const data = readData();
  const cart = getUserCart(data, req.user.id);

  const item = cart.find(
    i => i.productId === Number(req.params.productId)
  );

  if (!item) {
    return res.status(404).json({ error: "Cart item not found" });
  }

  item.quantity = quantity;
  saveData(data);

  res.json({
    message: "Cart updated successfully",
    cart
  });
});

// Remove one product
app.delete("/api/cart/:productId", authenticate, (req, res) => {
  const data = readData();
  const cart = getUserCart(data, req.user.id);

  const productId = Number(req.params.productId);
  const index = cart.findIndex(i => i.productId === productId);

  if (index === -1) {
    return res.status(404).json({ error: "Cart item not found" });
  }

  cart.splice(index, 1);
  saveData(data);

  res.json({
    message: "Product removed from cart",
    cart
  });
});

// Clear entire cart
app.delete("/api/cart", authenticate, (req, res) => {
  const data = readData();
  data.carts[String(req.user.id)] = [];

  saveData(data);

  res.json({ message: "Cart cleared successfully" });
});

// ---------------- CHECKOUT ----------------

app.post("/api/checkout", authenticate, (req, res) => {
  const {
    firstName,
    lastName,
    email,
    lootifyUsername,
    platform,
    region,
    gameAccountId
  } = req.body;

  if (!firstName || !lastName || !email ||
      !lootifyUsername || !platform || !region) {
    return res.status(400).json({
      error: "Required checkout information is missing"
    });
  }

  const data = readData();
  const cart = getUserCart(data, req.user.id);

  if (cart.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const items = [];

  for (const item of cart) {
    const product = data.products.find(p => p.id === item.productId);

    if (!product) {
      return res.status(400).json({ error: "Cart contains an unavailable product" });
    }

    items.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      total: product.price * item.quantity
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const serviceFee = 100;

  const order = {
    id: nextId(data.orders),
    userId: req.user.id,
    customer: {
      firstName,
      lastName,
      email,
      lootifyUsername,
      platform,
      region,
      gameAccountId: gameAccountId || ""
    },
    items,
    subtotal,
    serviceFee,
    total: subtotal + serviceFee,
    status: "Pending",
    createdAt: new Date().toISOString()
  };

  data.orders.push(order);
  data.carts[String(req.user.id)] = [];

  saveData(data);

  res.status(201).json({
    message: "Order placed successfully",
    order
  });
});

// ---------------- ORDERS ----------------

// View order history
app.get("/api/orders", authenticate, (req, res) => {
  const data = readData();

  const orders = data.orders.filter(
    order => order.userId === req.user.id
  );

  res.json(orders);
});

// View one order
app.get("/api/orders/:id", authenticate, (req, res) => {
  const data = readData();

  const order = data.orders.find(
    o => o.id === Number(req.params.id) &&
         o.userId === req.user.id
  );

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  res.json(order);
});

// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Invalid JSON request bodies
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Lootify API running at http://localhost:${PORT}`);
});