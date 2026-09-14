export const authService = {
  login(token, username, role) {
    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    localStorage.setItem('role', role);
  },
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
  },
  getToken() {
    return localStorage.getItem('token');
  },
  getRole() {
    return localStorage.getItem('role');
  },
  isAuthenticated() {
    return !!localStorage.getItem('token');
  }
};