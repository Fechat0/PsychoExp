# PsychoExp
心理与行为小组作业的实验网页。

## GitHub Pages
- 实验入口： https://fechat0.github.io/PsychoExp/
- 管理后台： https://fechat0.github.io/PsychoExp/admin.html

> 这是项目站点（Project Pages），访问路径必须包含仓库名 `/PsychoExp/`。
> 后台使用 Supabase Auth 登录；只有 `app_metadata.role = admin` 的账户可以读取实验数据。

## 四组实验与 Cookie 准入

- 首次进入实验时，前端自动生成不含个人身份信息的参与编号，并通过必要 Cookie 保存参与编号与固定分组。
- 分组编码：G1/G2 为人类顾问子组，G3/G4 为 AI 系统子组；`group_code` 区分四组，`group_type` 保留人类/AI 的二元实验因素。
- 如需修改四组对应的实验条件，请同步调整 `index.html` 中的 `GROUP_CONFIG` 和 `supabase/functions/submit-experiment/index.ts` 中的组别校验映射。
- 管理后台提供四组描述性统计，以及人类顾问/AI 的责任转移 χ² 独立性检验和 Cramér's V 效应量。责任转移均值按量表中点 4 分分成低于、等于和高于中点三类；小期望频数时同时给出固定边际 Monte Carlo 参考 p 值。

> Cookie 用于浏览器内维持参与编号和随机分组，不是不可伪造的身份认证。清除 Cookie、换浏览器或手动修改 Cookie 可能产生重复参与编号/改变分组；需要严格准入时，应改为研究者签发并由服务端验证的邀请令牌。

## 实验界面与结束状态

- 交易行情图采用红涨绿跌的模拟 K 线、MA5 均线和成交量柱展示；开盘/最高/最低价与成交量为根据预设收盘价生成的模拟展示值，不是真实证券报价。
- 问卷包含可选的自由建议栏，最多 70 词。建议保存到 `experiment_data.participant_suggestion`，管理员可在后台的“被试自由建议”区域查看并随 CSV 导出。
- 成功提交后，浏览器会写入 `pxe_completed_participant_id` Cookie；同一 Cookie 再次访问会直接显示完成页。清除 Cookie、更换浏览器或设备后，系统无法仅凭该标记识别此前的完成状态。

## 问卷、交易与顾问对话

- 被试端量表按题目顺序连续呈现，不显示“责任转移、能力、仁慈、诚信、未来信任”等构念分组标题；内部题目分组元数据保留用于后台统计。
- 被试从实验说明直接进入交易台。每日顾问建议显示在交易界面中；被试可自行打开“咨询顾问”，并从聊天顶部返回交易页面，不再强制先聊天再交易。
- 人类顾问聊天等待时，顶部昵称切换为“对方正在输入中...”，不在消息流中插入单独的输入气泡。顾问回复使用更长的等待窗口和分句发送节奏。
- 被试页面不显示模型调用来源或 Script Fallback 等内部技术状态。

## 管理员样本管理与 DeepSeek

- 管理员可将记录标记为异常样本并填写原因；标记只设置 `is_excluded` 等元数据，原始记录仍保留供追溯。后台图表、分组均值和 χ² 检验仅纳入 `is_excluded=false` 的样本。
- 管理员也可恢复纳入统计，或在二次确认后永久删除记录。更新/删除在数据库端受 `app_metadata.role=admin` 的 RLS 策略约束；一般参与者没有这些权限。
- DeepSeek 调用使用现行模型标识 `deepseek-flash`。管理员后台的“检测 DeepSeek API”按钮通过服务端读取 Vault 密钥并发送最小测试请求，不向浏览器返回密钥。
- Vault 读取函数只允许 `service_role` 调用，并兼容 PostgREST 的两种 JWT claim 设置格式。
