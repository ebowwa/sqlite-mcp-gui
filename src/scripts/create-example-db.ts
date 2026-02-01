import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the database file in the project root
const dbPath = path.resolve(__dirname, '../../example.db');

console.log(`Creating example database at: ${dbPath}`);

// Create database connection
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
console.log('Creating tables...');

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  )
`);

// Products table
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0
  )
`);

// Orders table
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )
`);

// Insert sample data
console.log('Inserting sample data...');

// Insert users
const insertUser = db.prepare(`
  INSERT INTO users (username, email, created_at)
  VALUES (?, ?, ?)
`);

const users = [
  { username: 'john_doe', email: 'john.doe@example.com', created_at: '2024-01-15T10:30:00Z' },
  { username: 'jane_smith', email: 'jane.smith@example.com', created_at: '2024-01-20T14:22:00Z' },
  { username: 'bob_wilson', email: 'bob.wilson@example.com', created_at: '2024-02-01T09:15:00Z' },
  { username: 'alice_johnson', email: 'alice.johnson@example.com', created_at: '2024-02-10T16:45:00Z' },
  { username: 'charlie_brown', email: 'charlie.brown@example.com', created_at: '2024-02-15T11:30:00Z' },
  { username: 'diana_prince', email: 'diana.prince@example.com', created_at: '2024-03-01T08:00:00Z' },
  { username: 'evan_wright', email: 'evan.wright@example.com', created_at: '2024-03-05T13:20:00Z' },
  { username: 'fiona_garcia', email: 'fiona.garcia@example.com', created_at: '2024-03-10T10:10:00Z' },
  { username: 'george_miller', email: 'george.miller@example.com', created_at: '2024-03-15T15:50:00Z' },
  { username: 'hannah_davis', email: 'hannah.davis@example.com', created_at: '2024-03-20T12:35:00Z' },
];

const insertManyUsers = db.transaction((users) => {
  for (const user of users) {
    insertUser.run(user.username, user.email, user.created_at);
  }
});
insertManyUsers(users);
console.log(`Inserted ${users.length} users`);

// Insert products
const insertProduct = db.prepare(`
  INSERT INTO products (name, price, category, stock)
  VALUES (?, ?, ?, ?)
`);

const products = [
  { name: 'Laptop Pro 15"', price: 1299.99, category: 'Electronics', stock: 25 },
  { name: 'Wireless Mouse', price: 29.99, category: 'Electronics', stock: 150 },
  { name: 'USB-C Cable', price: 12.99, category: 'Electronics', stock: 300 },
  { name: 'Office Chair', price: 249.99, category: 'Furniture', stock: 45 },
  { name: 'Standing Desk', price: 499.99, category: 'Furniture', stock: 20 },
  { name: 'LED Monitor 27"', price: 349.99, category: 'Electronics', stock: 60 },
  { name: 'Mechanical Keyboard', price: 89.99, category: 'Electronics', stock: 80 },
  { name: 'Coffee Maker', price: 79.99, category: 'Appliances', stock: 35 },
  { name: 'Desk Lamp', price: 34.99, category: 'Furniture', stock: 100 },
  { name: 'Wireless Headphones', price: 199.99, category: 'Electronics', stock: 55 },
  { name: 'Webcam HD', price: 69.99, category: 'Electronics', stock: 90 },
  { name: 'External SSD 1TB', price: 119.99, category: 'Electronics', stock: 70 },
  { name: 'Notebook Pack', price: 9.99, category: 'Stationery', stock: 500 },
  { name: 'Pen Set', price: 14.99, category: 'Stationery', stock: 200 },
  { name: 'Desk Organizer', price: 24.99, category: 'Furniture', stock: 120 },
];

const insertManyProducts = db.transaction((products) => {
  for (const product of products) {
    insertProduct.run(product.name, product.price, product.category, product.stock);
  }
});
insertManyProducts(products);
console.log(`Inserted ${products.length} products`);

// Insert orders
const insertOrder = db.prepare(`
  INSERT INTO orders (user_id, product_id, quantity, total, created_at)
  VALUES (?, ?, ?, ?, ?)
`);

const orders = [
  { user_id: 1, product_id: 1, quantity: 1, total: 1299.99, created_at: '2024-02-01T10:30:00Z' },
  { user_id: 1, product_id: 2, quantity: 2, total: 59.98, created_at: '2024-02-01T10:31:00Z' },
  { user_id: 2, product_id: 4, quantity: 1, total: 249.99, created_at: '2024-02-05T14:20:00Z' },
  { user_id: 2, product_id: 7, quantity: 1, total: 89.99, created_at: '2024-02-05T14:21:00Z' },
  { user_id: 3, product_id: 6, quantity: 2, total: 699.98, created_at: '2024-02-10T09:45:00Z' },
  { user_id: 3, product_id: 8, quantity: 1, total: 79.99, created_at: '2024-02-10T09:46:00Z' },
  { user_id: 4, product_id: 10, quantity: 1, total: 199.99, created_at: '2024-02-15T16:30:00Z' },
  { user_id: 4, product_id: 11, quantity: 2, total: 239.98, created_at: '2024-02-15T16:31:00Z' },
  { user_id: 5, product_id: 5, quantity: 1, total: 499.99, created_at: '2024-02-20T11:15:00Z' },
  { user_id: 5, product_id: 3, quantity: 5, total: 64.95, created_at: '2024-02-20T11:16:00Z' },
  { user_id: 6, product_id: 9, quantity: 3, total: 104.97, created_at: '2024-03-01T08:30:00Z' },
  { user_id: 6, product_id: 12, quantity: 1, total: 119.99, created_at: '2024-03-01T08:31:00Z' },
  { user_id: 7, product_id: 13, quantity: 10, total: 99.90, created_at: '2024-03-06T13:45:00Z' },
  { user_id: 7, product_id: 14, quantity: 5, total: 74.95, created_at: '2024-03-06T13:46:00Z' },
  { user_id: 8, product_id: 15, quantity: 2, total: 49.98, created_at: '2024-03-11T10:20:00Z' },
  { user_id: 8, product_id: 2, quantity: 3, total: 89.97, created_at: '2024-03-11T10:21:00Z' },
  { user_id: 9, product_id: 1, quantity: 1, total: 1299.99, created_at: '2024-03-16T15:40:00Z' },
  { user_id: 9, product_id: 6, quantity: 1, total: 349.99, created_at: '2024-03-16T15:41:00Z' },
  { user_id: 10, product_id: 10, quantity: 1, total: 199.99, created_at: '2024-03-21T12:25:00Z' },
  { user_id: 10, product_id: 7, quantity: 1, total: 89.99, created_at: '2024-03-21T12:26:00Z' },
  { user_id: 1, product_id: 8, quantity: 2, total: 159.98, created_at: '2024-03-25T10:00:00Z' },
  { user_id: 2, product_id: 11, quantity: 1, total: 119.99, created_at: '2024-03-26T14:15:00Z' },
  { user_id: 3, product_id: 9, quantity: 1, total: 34.99, created_at: '2024-03-27T09:30:00Z' },
  { user_id: 4, product_id: 3, quantity: 10, total: 129.90, created_at: '2024-03-28T16:45:00Z' },
  { user_id: 5, product_id: 12, quantity: 3, total: 359.97, created_at: '2024-03-29T11:20:00Z' },
];

const insertManyOrders = db.transaction((orders) => {
  for (const order of orders) {
    insertOrder.run(order.user_id, order.product_id, order.quantity, order.total, order.created_at);
  }
});
insertManyOrders(orders);
console.log(`Inserted ${orders.length} orders`);

// Verify data
console.log('\n--- Database Summary ---');
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };

console.log(`Users: ${userCount.count}`);
console.log(`Products: ${productCount.count}`);
console.log(`Orders: ${orderCount.count}`);

// Close database
db.close();

console.log(`\nExample database created successfully at: ${dbPath}`);
