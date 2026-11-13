# PsychoExp
心理与行为小组作业的实验网页。

## GitHub Pages
- 实验入口： https://fechat0.github.io/PychoExp/
- 管理后台： https://fechat0.github.io/PychoExp/admin.html

> 这是项目站点（Project Pages），访问路径必须包含仓库名 `/PychoExp/`。
> 后台使用 Supabase Auth 登录；只有 `app_metadata.role = admin` 的账户可以读取实验数据。

## 四组实验与 Cookie 准入

- 首次进入实验时，前端自动生成不含个人身份信息的参与编号，并通过必要 Cookie 保存参与编号与固定分组。
- 分组编码：G1/G2 为人类顾问子组，G3/G4 为 AI 系统子组；`group_code` 区分四组，`group_type` 保留人类/AI 的二元实验因素。
- 如需修改四组对应的实验条件，请同步调整 `index.html` 中的 `GROUP_CONFIG` 和 `supabase/functions/submit-experiment/index.ts` 中的组别校验映射。
- 管理后台提供四组描述性统计，以及人类顾问/AI 的责任转移 χ² 独立性检验和 Cramér's V 效应量。责任转移均值按量表中点 4 分分成低于、等于和高于中点三类；小期望频数时同时给出固定边际 Monte Carlo 参考 p 值。

> Cookie 用于浏览器内维持参与编号和随机分组，不是不可伪造的身份认证。清除 Cookie、换浏览器或手动修改 Cookie 可能产生重复参与编号/改变分组；需要严格准入时，应改为研究者签发并由服务端验证的邀请令牌。
