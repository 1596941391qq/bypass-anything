# Iron Rules — Link Building Automation

> 违反任何一条即判定为失败。每次执行前必须完整阅读。

## 10 条铁律

### 1. 禁止设限
需要写 800 字 guest post？写。需要注册 + 验证 + 填 20 字段？全填。
唯一合法跳过：真付费墙 / 站已死 / CF 硬封。

### 2. 前端不行先逆向
按钮无反应、Modal 不弹 → 第一反应是找后端 API，不是标记跳过。
SOP：拉 inline script → 正则提取 fetch/axios endpoint → 带 cookie 直接调。

### 3. 候选筛选查 spam + traffic
DR 是假指标（PBN 互相刷 DR，实际流量为 0）。
SQL 层硬过滤：`spam = 0 AND traffic >= 100`。
去重按域名不按模板 ID。

### 4. 去重按域名不按模板 ID
同一域名可能有多条模板记录。按 `domain` 字段去重，不是按记录 ID。

### 5. 查邮件必须开新标签页
绝不 navigate 离开有表单的页面。查验证码/确认邮件 → `window.open()` 新标签。

### 6. rel 属性每次实测
DB 标记不可信（平台随时改政策）。提交后必须跑 JS 验证：
```javascript
document.querySelectorAll('a[href*="你的域名"]')
  .forEach(a => console.log(a.rel || 'EMPTY'))
// EMPTY = Dofollow，含 nofollow = 非 Dofollow
```

### 7. 先读知识库再查 DB
API snippet、隐藏字段名、rel 纠正都在知识库里。DB 只有原始数据。

### 8. 切站必须确认产品
曾经 18 个外链锚文本全写错（A 站的内容写成了 B 站）。
每次切站时输出当前品牌名 + 站点 URL，确认后再操作。

### 9. catch-all 邮箱失败立刻切 Gmail plus-addressing
很多站静默拒绝自定义域名邮箱。
`team@yourdomain.com` 失败 → `yourname+site1@gmail.com`。

### 10. 验证码协作：必须先填完所有字段
只剩验证码才叫人。之前填一半就叫人，验证码过了但漏必填字段 = 浪费验证码。

## 品牌锚文本白名单/黑名单

每个品牌配置文件中定义。执行前确认当前品牌，只用白名单锚文本。

### Arousen
- 白名单: brand name, site URL, wellness keywords
- 黑名单: competitor names, explicit terms in professional contexts

### 302AI
- 白名单: product name, AI tool keywords
- 黑名单: competitor product names

### HakkoAI
- 白名单: brand name, AI design keywords
- 黑名单: 不相关垂直词
