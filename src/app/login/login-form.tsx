export function LoginForm({ error }: { error?: string }) {
  return (
    <form action="/api/auth/login" method="post" className="admin-form login-form">
      <label>登录账号<input name="username" type="text" autoCapitalize="none" autoComplete="username" minLength={3} maxLength={40} required placeholder="用户名" /></label>
      <label>密码<input name="password" type="password" autoComplete="current-password" minLength={1} maxLength={128} required placeholder="至少12位" /></label>
      {error ? <p className="form-error" role="alert">{error === "locked" ? "尝试次数过多，请约15分钟后重试" : "账号或密码不正确，请重试"}</p> : null}
      <button className="button button-dark" type="submit">登录私人后台</button>
    </form>
  );
}
