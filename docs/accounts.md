# Accounts — 账号、邮箱与多实例架构

> 多品牌并行执行的账号管理策略。

## 邮箱策略

### 每个品牌一个主邮箱
```
品牌A: branda.seo@gmail.com
品牌B: brandb.seo@gmail.com
品牌C: brandc.seo@gmail.com
```

### Plus Addressing（同一个 Gmail 收件）
```
branda.seo+directory1@gmail.com  → 收到 branda.seo@gmail.com
branda.seo+directory2@gmail.com  → 收到 branda.seo@gmail.com
branda.seo+forum3@gmail.com      → 收到 branda.seo@gmail.com
```
优势：无限个别名，全收到同一个收件箱。
注意：部分站识别并拒绝 + 地址。

### Catch-all 域名邮箱（备选）
```
*@yourdomain.com → forward to main@gmail.com
```
风险：很多站静默拒绝自定义域名邮箱（Akismet 标记）。
只在大平台（Crunchbase, LinkedIn）使用。

## OAuth 管理

### Google OAuth
用于：Blogger, YouTube, Google Sites, velog.io 等
每个品牌一个 Google 账号，独立 Chrome Profile。

### GitHub OAuth
用于：dev.to, velog.io, npm 等
每个品牌一个 GitHub 账号。

## 多实例 Playwright 并发架构

### 基础配置
每个品牌独立：
- Chrome Profile 目录（cookie/session 完全隔离）
- ISP 代理端口（每品牌不同 IP）
- Playwright MCP 实例（独立浏览器进程）

### tmux 并行启动
```bash
# 品牌A
tmux pane 1: cd backlink-site-a && claude
# 品牌B
tmux pane 2: cd backlink-site-b && claude
# 品牌C
tmux pane 3: cd backlink-site-c && claude
```

### settings.json 配置
每个品牌的项目目录下有独立的 `.claude/settings.json`：
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-playwright"],
      "env": {
        "CHROME_PROFILE": "C:\\chrome-pseo-branda",
        "PROXY_PORT": "9222"
      }
    }
  }
}
```

## 当前品牌账号映射

### Arousen
- Gmail: [配置在 brand config 中]
- Chrome Profile: `C:\chrome-pseo-arousen`
- CDP Port: 9222
- 已完成: Crunchbase, Brownbook, Blogger, WordPress.com, Gravatar, LiveJournal
- 待审核: Viesearch
- 已阻塞: Substack (suspended), AboutUs (session error)

### 302AI
- Gmail: [配置在 brand config 中]
- Chrome Profile: `C:\chrome-pseo-302ai`
- CDP Port: 9223

### HakkoAI
- Gmail: [配置在 brand config 中]
- Chrome Profile: `C:\chrome-pseo-hakkoai`
- CDP Port: 9224

## 账号安全

- 每个品牌用独立密码
- 开启 2FA（用 Google Authenticator）
- 不在多个平台用相同密码
- 定期检查账号状态（是否被封/限流）
