# Platforms — 活跃平台操作速查

> 按类型分类，每个平台的关键信息。

## 类型一：Profile / 实体页

| 平台 | 注册方式 | 关键字段 | 验证码类型 | 已知坑点 |
|------|----------|----------|------------|----------|
| Crunchbase | Email/Google | organization_name, homepage_url, description | 无 | 需社会认证才有完整 profile |
| Gravatar | Email/WordPress.com | display_name, about_me, website | 无 | 必须开 public profile |
| about.me | Email | name, bio, website | 无 | 链接是 nofollow redirect |
| LinkedIn Company | Email | company_name, website, description | 无 | 需个人账号资格才能建公司页 |
| Pinterest Business | Email | profile_name, website, boards | reCAPTCHA | 无 explicit visuals |

## 类型二：文章 / Web 2.0

| 平台 | 注册方式 | 关键字段 | 验证码类型 | 已知坑点 |
|------|----------|----------|------------|----------|
| Blogger | Google OAuth | site_title, content, link_anchor | 无 | 需 SFW 内容 |
| WordPress.com | Email | site_title, content, about_link | 无 | free plan 有限制 |
| Medium | Google/GitHub/Email | article_title, content, brand_mention | 无 | 链接 nofollow，但有品牌信号 |
| dev.to | GitHub OAuth | article (Markdown), links | 无 | 文章内链接 Dofollow |
| velog.io | GitHub/Google OAuth | article (Markdown), links | 无 | 韩国平台，支持英文内容 |
| LiveJournal | Email | journal_name, content | reCAPTCHA | 需 wellness 语气 |
| Tumblr | Email | blog_title, content | reCAPTCHA | 验证码概率出现 |

## 类型三：论坛

| 平台类型 | 注册方式 | 关键字段 | 验证码类型 | 已知坑点 |
|----------|----------|----------|------------|----------|
| phpBB 论坛 | Email | username, pf_phpbb_website | 各站不同 | Website 字段 Dofollow |
| Discuz 论坛 | Email | Site 字段 (op=info) | 各站不同 | 不在 op=base 页面填 |
| Boardhost | 无需注册 | Link URL | 无 | 最快，秒发 |
| Reddit | Email | username, profile_link | reCAPTCHA | 需养号，直接推链接效果差 |
| Quora | Email/Google | profile_name, credentials, answers | 无 | 回答需有价值 |

## 类型四：目录站

| 平台 | 注册方式 | 关键字段 | 验证码类型 | 已知坑点 |
|------|----------|----------|------------|----------|
| Brownbook | Email | Business Name, Website, Description | reCAPTCHA | 需邮箱验证 |
| Viesearch | 无需注册 | site_url, title, description | 无 | 排队超长（11000+） |
| SubmitDirs | 无需注册 | site_url, title, description, email | 无 | 审核不即时 |
| Hotfrog | Email | business_name, website, category | 无 | 需从首页 Add Business 进入 |
| Manta | Email | business_name, website | 无 | 需要真实联系字段 |
| Cylex | 无需注册 | business_name, website, description | 无 | 审核慢 |
| Cybo | Email | business_name, website, description | 无 | 需要真实联系字段 |

## 类型五：SaaS 目录（高 ROI）

| 平台 | 注册方式 | 关键字段 | Dofollow 率 | 备注 |
|------|----------|----------|-------------|------|
| 各 SaaS 目录 | 多样 | product URL, name, description | ~100% | 找 "Submit" 入口 |

## 类型六：快速 API 平台

| 平台 | 方式 | Dofollow | 难度 | 备注 |
|------|------|----------|------|------|
| telegra.ph | API (curl) | 是 | very_low | DR92，但索引不稳定 |
| rentry.co | API (curl) | 是 | very_low | 需确保索引 |

## 平台状态标记

执行后每个平台标记以下状态之一：
- `alive` — 可正常提交
- `blocked` — 被封/不可用
- `captcha_hard` — 验证码过不了
- `nofollow_confirmed` — 实测 nofollow
- `paid_wall` — 需付费
- `dead` — 站点已关闭
