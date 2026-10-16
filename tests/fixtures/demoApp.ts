import type { Page } from '@playwright/test';
import { DEMO_URL } from '../../src/pages/DemoLoginPage';

/**
 * Local demo login page served through page.route (no server, no network).
 *  - original:         locators match the Page Object
 *  - changed-username: #username became data-testid="login-user" (healable locator change)
 *  - ambiguous-submit: #login-button replaced by two identical attribute-less "Sign in" buttons
 *  - disabled-submit:  button exists but is disabled (application state, not a locator change)
 */
export type DemoVariant = 'original' | 'changed-username' | 'ambiguous-submit' | 'disabled-submit';

export const DEMO_CREDENTIALS = { username: 'demo_user', password: 'S3cret-Pa55!' } as const;

function usernameField(variant: DemoVariant): string {
  return variant === 'changed-username'
    ? '<label>Username <input data-testid="login-user" name="user" type="text" placeholder="Enter username" autocomplete="username"></label>'
    : '<label for="username">Username</label><input id="username" name="user" type="text" placeholder="Enter username" autocomplete="username">';
}

function submitButton(variant: DemoVariant): string {
  switch (variant) {
    case 'ambiguous-submit':
      return '<button type="submit">Sign in</button><button type="submit">Sign in</button>';
    case 'disabled-submit':
      return '<button id="login-button" type="submit" disabled>Sign in</button><p id="error" role="alert">Login is temporarily disabled</p>';
    default:
      return '<button id="login-button" type="submit">Sign in</button>';
  }
}

export function demoHtml(variant: DemoVariant): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Demo Login</title>
<style>body{font-family:sans-serif;margin:40px} form{display:grid;gap:8px;max-width:320px} #welcome{color:green} #error{color:#b00}</style>
</head>
<body>
  <h1>Demo Login</h1>
  <a href="#help">Need help?</a>
  <form id="login-form">
    ${usernameField(variant)}
    <label for="password">Password</label><input id="password" name="pass" type="password" autocomplete="current-password">
    <label><input id="remember-me" type="checkbox"> Remember me</label>
    <label for="role">Role</label>
    <select id="role" name="role"><option value="user">User</option><option value="admin">Admin</option></select>
    ${submitButton(variant)}
    <button type="button" id="forgot">Forgot password</button>
  </form>
  <p id="welcome" hidden></p>
  ${variant === 'disabled-submit' ? '' : '<p id="error" role="alert" hidden></p>'}
  <script>
    document.getElementById('login-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      const user = form.elements.user.value;
      const pass = form.elements.pass.value;
      const ok = user === ${JSON.stringify(DEMO_CREDENTIALS.username)} && pass === ${JSON.stringify(DEMO_CREDENTIALS.password)};
      const welcome = document.getElementById('welcome');
      const error = document.getElementById('error');
      welcome.hidden = !ok;
      error.hidden = ok;
      if (ok) welcome.textContent = 'Welcome, ' + user;
      else error.textContent = 'Invalid username or password';
    });
  </script>
</body>
</html>`;
}

export async function serveDemo(page: Page, variant: DemoVariant): Promise<void> {
  await page.route(`${DEMO_URL}**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: demoHtml(variant) }));
}
