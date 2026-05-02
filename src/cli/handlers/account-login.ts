import inquirer from "inquirer";
import { FileSessionManager } from "../../adapters/FileSessionManager";
import { LoginOracle } from "../../utils/login-oracle";
import { CliDeps, CliAction } from "../types";

export async function handleAccountLogin(deps: CliDeps, action: CliAction): Promise<void> {
  const sessionManager = new FileSessionManager();
  const oracle = new LoginOracle(sessionManager, deps.logger);
  const intel = await oracle.gatherIntel(action.loginUrl || "");

  console.log("\n📋 登录情报分析结果：");
  console.log(`   登录接口：${intel.formAction || "未自动探测到，将使用表单提交"}`);
  console.log(`   用户名字段：${intel.paramMap.username}`);
  console.log(`   密码字段：${intel.paramMap.password}`);
  console.log(`   验证码：${intel.captchaRequired ? "需要" : "无需"}`);

  if (intel.captchaRequired) {
    console.log("\n⚠️ 检测到验证码相关字段（可能为误报），自动登录可能存在困难，将尝试继续...\n");
  }

  const { username, password } = await inquirer.prompt([
    { type: "input", name: "username", message: "请输入用户名/邮箱：" },
    { type: "password", name: "password", message: "请输入密码：" }
  ]);

  const session = await oracle.executeLogin(action.loginUrl || "", action.verifyUrl || action.loginUrl || "", intel, username, password, action.profile || "default");
  if (session) deps.logger.info(`✅ 登录成功！会话已保存为 [${action.profile}]`);
  else deps.logger.error("❌ 自动登录失败，请检查账号密码或手动操作");
}
