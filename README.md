# hxwl-06 显微镜玻片借还台

玻片盒位登记、按课次预约、借出归还、待检补片与换班对账。

## 技术栈

React + Vite + TypeScript + CSS（无新增依赖，存档用浏览器 localStorage）

## 本地运行

```bash
npm install
npm run dev
```

开发端口：5106

## 分层结构

资料、判断、保存、页面分开，互不混杂：

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 资料 | `src/data/catalog.ts` | 玻片台账（名称、染色、登记盒位、格号）、玻片盒、课次表 |
| 判断 | `src/domain/models.ts` | 领域数据类型（预约、借出流水、玻片状态、存档） |
| 判断 | `src/domain/rules.ts` | 全部业务规则的纯函数：预约、借出、归还、待检、补片、盒余量、对账、自愈 |
| 保存 | `src/storage/persistence.ts` | localStorage 的读取、结构校验、按流水自愈、写入、换班重读 |
| 页面 | `src/components/SlideCard.tsx` | 单张玻片的预约/借出/归还/待检卡片交互 |
| 页面 | `src/App.tsx` | 借还台总览：看板、盒余量、对账、筛选与角色切换 |

## 业务规则

- 每张玻片登记盒位，状态为：在库可约 / 借出中 / 待检。
- 学生按课次预约；同一课次一张玻片只能留一个借用人（待转借的预约和未归还借出都算占用）。
- 管理员可把预约转借出，也可未预约现场登记借用，课次占用规则相同。
- 归还位置与登记盒位不一致、或盖片破损时，必须填写管理员处理意见，玻片转入待检。
- 待检玻片在补片完成前不能再次预约或借出；补片完成后恢复在库。
- 整盒余量 = 总数 − 借出 − 待检。
- 借出/归还是流水记录，玻片状态可由流水重新推导；换班或重开页面后自动对账，状态与流水不符时以流水为准自愈。

## 规则自检

判断层是纯函数，可用 esbuild（随 vite 安装，不新增依赖）打包到 Node 下验证：

```bash
npx esbuild scripts/check-rules.ts --bundle --platform=node --format=esm \
  --outfile=scripts/check-rules.mjs && node scripts/check-rules.mjs
```
