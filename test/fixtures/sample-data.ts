/**
 * Sample data for testing
 */
export const sampleUsers = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user' },
  { id: 3, name: 'Carol White', email: 'carol@example.com', role: 'user' },
];

export const sampleProducts = [
  { id: 1, name: 'Laptop Pro 15', price: 1299.99, stock: 15, category: 'Electronics' },
  { id: 2, name: 'Wireless Mouse', price: 29.99, stock: 100, category: 'Electronics' },
  { id: 3, name: 'Mechanical Keyboard', price: 89.99, stock: 45, category: 'Electronics' },
];

export const sampleQueries = {
  selectAll: 'SELECT * FROM users',
  selectWithWhere: "SELECT * FROM users WHERE role = 'admin'",
  insert: "INSERT INTO users (name, email, role) VALUES ('Test User', 'test@example.com', 'user')",
  update: "UPDATE users SET role = 'admin' WHERE id = 2",
  delete: 'DELETE FROM users WHERE id = 3',
  createTable: 'CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)',
};

export const invalidQueries = {
  empty: '',
  tooLong: 'SELECT * FROM users WHERE ' + 'x=1 '.repeat(10000),
  sqlInjection: "SELECT * FROM users WHERE name = '; DROP TABLE users; --'",
  dangerousDrop: 'SELECT * FROM users; DROP TABLE users',
};
