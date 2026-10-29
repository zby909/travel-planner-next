import { requireEditor } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const user = await requireEditor();
  return <main>
    <div className="admin-page-heading">
      <p className="eyebrow">ACCOUNT SECURITY</p>
      <h1>账号安全</h1>
      <p>当前账号：{user.displayName}（{user.username}）。修改密码后当前及其他设备会话均会失效。</p>
    </div>
    <PasswordForm />
  </main>;
}
