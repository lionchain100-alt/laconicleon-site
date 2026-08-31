# 发文后台启用说明

后台地址是 `/admin`。它用 GitHub 登录，文章会直接写进 `src/content/posts/`，并触发 Cloudflare Pages 自动部署。

部署前只需做一次：

1. 本目录已推送到 GitHub 仓库 `lionchain100-alt/laconicleon-site`。
2. 在 GitHub 创建 OAuth App，回调地址填写 `https://laconicleon.com/api/callback`。
3. 在 Cloudflare Pages 添加环境变量 `GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET`。
4. `public/admin/config.yml` 已配置真实仓库与正式域名。
5. 在 Cloudflare Pages 将仓库部署连接好，或为该仓库配置自动部署。

之后打开 `/admin` → GitHub 登录 → 新建文章 → 发布。只有拥有该仓库写权限的 GitHub 账号才能发文。
