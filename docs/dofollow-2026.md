# Dofollow 2026 — 实测存活地图

> 基于社区实测 + Yifei 300+ 提交验证。2026 年大量平台集体加了 nofollow。

## 三大存活类别

### 第一类：开发者博客平台（高确定性）

| 平台 | 注册方式 | Dofollow 类型 | 难度 | 备注 |
|------|----------|---------------|------|------|
| velog.io | GitHub/Google OAuth | 文章内链接 Dofollow | low | 韩国最大开发者博客，Markdown，即发即过 |
| dev.to | GitHub OAuth | 文章内链接 Dofollow | low | 可做链接枢纽，多篇互链 |
| telegra.ph | API 创建（无需注册） | 文章链接 Dofollow | very_low | DR92，秒做，但索引不稳定 |
| rentry.co | curl API | 链接 Dofollow | very_low | 秒做，需确保索引 |

### 第二类：SaaS 目录提交（最高 ROI）

**特征识别：**
- 有 "Submit product/tool" 入口
- URL 格式为品牌短 slug（如 `/product/your-brand`）
- 有 "Visit website" 按钮
- 按钮默认 Dofollow

**获取成本：** 只填 1 个 URL + 基本信息。
**Dofollow 率：** 接近 100%。
**关键洞察：** SaaS 目录是获取成本最低、Dofollow 率最高、存活最持久的外链类型。
但 2026 年大量目录站转付费，免费窗口正在关闭。

**目标平台（需逐一验证）：**
- Product Hunt（nofollow 但品牌信号极高）
- G2 / Capterra / Software Advice（nofollow 但高流量）
- 各垂直领域 SaaS 目录
- Startups.cx / Betalist 类目录站

### 第三类：论坛 Profile Website 字段

| 论坛类型 | Dofollow 字段 | 成功率 | 备注 |
|----------|---------------|--------|------|
| phpBB | `pf_phpbb_website` | 100% | 默认 Dofollow，全球最常见论坛引擎 |
| Boardhost | Link URL 字段 | 95% | 免费论坛，无需注册 |
| Discuz | Site 字段（op=info 页面） | 80% | 注意不在 op=base 页面填 |
| XenForo | Website 字段 | 70% | 部分站加了 nofollow |
| vBulletin | Homepage 字段 | 60% | 老站多，新站少 |

## 已确认降级平台

以下平台曾经 Dofollow，2026 年加了 `rel="ugc nofollow"`：

| 平台 | 降级时间 | 替代价值 |
|------|----------|----------|
| paragraph.com | 2025 Q4 | 低 |
| hackmd.io | 2026 Q1 | 低 |
| justpaste.it | 2025 Q4 | 低 |
| codepen.io | 2026 Q1 | 仍可作为技术展示 |
| pastebin.com | 2025 Q4 | 无 |
| ghost.io (免费) | 2026 Q1 | 低 |
| medium.com | 持续 | 仍有品牌信号价值 |
| linkedin.com | 持续 | 高品牌信号，nofollow |

**降级规律：** 平台主动响应 Google 政策变化，给 UGC 内容加 `rel="ugc nofollow"`。
paste/note 类平台集体降级。博客平台仍有部分 Dofollow。

## 关于 Nofollow 的正确认知

1. **Google 2019 政策变化：** nofollow 从"指令"变为"提示"，Google 会选择性传递权重
2. **自然分布更安全：** 90%+ Dofollow 比例反而可能被判定为刷 DR
3. **高 DR 站的 Nofollow 品牌信号极高：** GitHub DR96、Medium DR94、LinkedIn DR98
4. **不要只追 Dofollow：** 自然的外链分布应该是 ~40% Dofollow + ~60% Nofollow

## 外链类型价值排序

```
SaaS 目录提交 > 开发者博客文章 > 论坛 Profile > WP 评论 > 短链/书签
```

ROI 从左到右递减。精力分配建议：50% SaaS 目录，30% 博客/Profile，20% 其他。
