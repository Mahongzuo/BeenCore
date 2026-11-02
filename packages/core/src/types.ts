/**
 * Been 的数据模型。
 *
 * 只有一个核心实体：Trace（印记）。周页、人生之书、那年今日都只是它的不同视图。
 * 客户端（SQLite）与服务端（D1）共用这些类型。
 */

/** 人生之书的章节主题。故意保持很少，宁缺毋滥。 */
export const THEMES = [
  'everyday',
  'journey',
  'growth',
  'study',
  'work',
  'family',
  'love',
  'farewell',
] as const;
export type Theme = (typeof THEMES)[number];

/**
 * 时间精度。补记旧事时，人常常只记得“大约那一年”。
 * 精度决定显示方式，也决定在周页、那年今日里是否出现。
 */
export type DatePrecision = 'day' | 'month' | 'year';

/** private：只属于自己。wall：在地点墙上签名并留下一句话。 */
export type Visibility = 'private' | 'wall';

export interface Place {
  lat: number;
  lng: number;
  /** 逆地理编码得到的地名，离线时为空，联网后补上 */
  name?: string | null;
  /** 国家/地区代码，用于邮戳外圈文字 */
  country?: string | null;
  /**
   * 关联的谷歌地图地点 ID（place_id）。谷歌允许永久保存的只有这个 ID，
   * 名字、照片、评价都不保存，需要时跳转到 Google 地图查看。
   */
  poiId?: string | null;
}

export interface Trace {
  id: string;
  /** 用户写下的话。可以只有一句。 */
  text: string;
  /** 这件事发生的时间（毫秒），不是写下的时间 */
  happenedAt: number;
  precision: DatePrecision;
  place: Place | null;
  /** geohash-6（约 1.2km × 0.6km），地点墙的格子 */
  placeKey: string | null;
  theme: Theme;
  visibility: Visibility;
  /** 签在地点墙上的那一句（≤ 60 字），仅 visibility = wall 时有效 */
  wallNote: string | null;
  /** 签名成功后服务端返回的序号：「第 N 位来过的人」。离线时为 null，联网后补签。 */
  wallSeq: number | null;
  /** 时光胶囊：在这个时间之前，内容保持封存。null 表示不封存。 */
  opensAt: number | null;
  photoIds: string[];
  /**
   * 这枚印记属于谁：null（或旧数据里缺省）是「我」，否则是某份亲友 / 宠物档案的 id。
   * 档案的印记不出现在「我」的地图、印记和传记里，也不签地点墙。
   */
  ownerId?: string | null;
  createdAt: number;
  updatedAt: number;
  /** 软删除的墓碑。同步需要知道“删了”，而不是“不见了”。 */
  deletedAt: number | null;
}

/** 一个时间点和它的精度（只记得年份也可以） */
export interface FuzzyDate {
  at: number;
  precision: DatePrecision;
}

export type PersonKind = 'person' | 'pet';

/**
 * 亲友或宠物的档案。内容与「我」隔离：有自己的印记、地图和传记。
 * 默认只在本机（和自己的同步副本）里，公开纪念是以后的事，且只限已离世的人和宠物。
 */
export interface Person {
  id: string;
  kind: PersonKind;
  name: string;
  /** 和我的关系：外婆、老朋友、我的猫…… */
  relation: string | null;
  /** 宠物的种类：猫、狗…… */
  species: string | null;
  born: FuzzyDate | null;
  /** 离开的时间。null 表示还在身边（或不想写）。 */
  died: FuzzyDate | null;
  /** 头像照片（存在 photos 表里，traceId 填档案 id） */
  portraitPhotoId: string | null;
  /** 一段话：TA 是什么样的人 / 小家伙 */
  bio: string | null;
  /** 安葬或撒骨灰的地方，可选（公开纪念时用） */
  restingPlace: Place | null;
  visibility: 'private' | 'memorial';
  /** 公开纪念时，主人挑选出现在纪念页上的印记 */
  memorialTraceIds?: string[];
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Photo {
  id: string;
  traceId: string;
  width: number;
  height: number;
  mime: string;
  /** 本地位置：原生端为文件 URI，Web 端为 sqlite 中的 blob 键 */
  localRef: string | null;
  /** 上传到对象存储后的键 */
  remoteKey: string | null;
  createdAt: number;
}

/** 地点墙上的历史人物种子。数据来自 Wikidata（CC0）。 */
export interface Seed {
  /** Wikidata Q 号，例如 "Q7186" */
  id: string;
  name: string;
  nameZh?: string;
  /** Wikidata 的一句话描述，例如 "Polish-French physicist and chemist" */
  desc?: string;
  descZh?: string;
  /** 用于排序与显示的年份，可为负数（公元前） */
  year: number;
  kind: SeedKind;
  lat: number;
  lng: number;
  /** 出生/去世地点的名称，例如 "Warsaw" */
  placeName?: string;
  source: 'wikidata';
}
export type SeedKind = 'born' | 'died';

/** 地点墙上，别人留下的一句话（服务端数据）。只可看见，没有互动。 */
export interface WallNote {
  id: string;
  text: string;
  seq: number;
  seasonLabel: string;
  createdAt: number;
  mine?: boolean;
}

/** 「别人来过」图层上的一面墙：只有位置和人数 */
export interface WallPoint {
  key: string;
  lat: number;
  lng: number;
  name: string | null;
  count: number;
}

export interface WallSummary {
  key: string;
  displayName: string | null;
  visitorCount: number;
  firstVisitAt: number | null;
  /** 我是第几位，未签名则为 null */
  mySeq: number | null;
  notes: WallNote[];
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
