// 资料层：玻片、玻片盒与课次表的登记信息（静态数据，与运行状态分开）。

export const BOXES: { id: string; name: string }[] = [
  { id: "A", name: "A 盒 · 植物组织" },
  { id: "B", name: "B 盒 · 动物组织" },
  { id: "C", name: "C 盒 · 微生物/血液" },
];

export const SLIDES: {
  id: string;
  name: string;
  stain: string;
  boxId: string;
  slot: string;
}[] = [
  { id: "A-01", name: "洋葱表皮", stain: "碘液染色", boxId: "A", slot: "1" },
  { id: "A-02", name: "蚕豆叶下表皮", stain: "永久装片", boxId: "A", slot: "2" },
  { id: "A-03", name: "玉米根尖纵切", stain: "醋酸洋红", boxId: "A", slot: "3" },
  { id: "B-01", name: "人口腔上皮", stain: "亚甲基蓝", boxId: "B", slot: "1" },
  { id: "B-02", name: "蛙肝横切", stain: "HE 染色", boxId: "B", slot: "2" },
  { id: "B-03", name: "骨骼肌纵切", stain: "HE 染色", boxId: "B", slot: "3" },
  { id: "C-01", name: "人血涂片", stain: "瑞氏染色", boxId: "C", slot: "1" },
  { id: "C-02", name: "草履虫", stain: "活体装片", boxId: "C", slot: "2" },
  { id: "C-03", name: "水绵", stain: "永久装片", boxId: "C", slot: "3" },
  { id: "C-04", name: "酵母菌涂片", stain: "美蓝染色", boxId: "C", slot: "4" },
];

export const LESSONS: string[] = [
  "第4周 周二 第1-2节",
  "第4周 周三 第3-4节",
  "第4周 周四 第3-4节",
  "第5周 周一 第1-2节",
  "第5周 周二 第5-6节",
];

export function slideDef(id: string) {
  return SLIDES.find((s) => s.id === id);
}

export function boxName(id: string): string {
  return BOXES.find((b) => b.id === id)?.name ?? id;
}
