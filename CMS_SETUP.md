# 发文后台启用说明

后台地址是 `/admin`。它用 GitHub 登录，文章会直接写进 `src/content/posts/`，并触发 Cloudflare Pages 自动部署。

部署前只需做一次：

1. 把本目录推送到你的 GitHub 仓库。
2. 在 GitHub 创建 OAuth App，回调地址填写 `https://你的域名/api/callback`。
3. 在 Cloudflare Pages 添加环境变量 `GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET`。
4. 把 `public/admin/config.yml` 的 `repo` 与 `base_url` 改成真实值。
5. 连接 GitHub 仓库部署到 Cloudflare Pages。

之后打开 `/admin` → GitHub 登录 → 新建文章 → 发布。只有拥有该仓库写权限的 GitHub 账号才能发文。
