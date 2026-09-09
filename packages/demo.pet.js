// 桌面宠物猫：状态机跑在隔离 Worker 里，宿主只收到受校验的状态补丁。
// 衰减模型与设计说明见 demo.pet.json 的 page.body。

const TICK_MS = 60_000; // 一分钟一个衰减 tick
const MAX_OFFLINE_MS = 12 * 60 * 60 * 1000; // 离线衰减封顶 12h —— 回来最差也是可救状态
const DECAY_PER_TICK = { satiety: 0.4, mood: 0.15, energy: 0.1 };
const STARVING_MOOD_MULTIPLIER = 3; // 饿到 0 后心情三倍速掉

const FEED_GAIN = 30;
const PET_MOOD_GAIN = 8;
const REST_GAIN = 40;

const clamp = (value) => Math.min(100, Math.max(0, value));

function num(state, key) {
  const value = state[key];
  return typeof value === "number" ? value : 0;
}

/** 按真实时间结算衰减；返回新 state（纯计算）。 */
function settle(state, now) {
  const lasttick = num(state, "lasttick") || now;
  const elapsed = Math.min(Math.max(now - lasttick, 0), MAX_OFFLINE_MS);
  const ticks = elapsed / TICK_MS;
  const satiety = clamp(num(state, "satiety") - DECAY_PER_TICK.satiety * ticks);
  const starving = satiety <= 0;
  const mood = clamp(num(state, "mood") - DECAY_PER_TICK.mood * (starving ? STARVING_MOOD_MULTIPLIER : 1) * ticks);
  const energy = clamp(num(state, "energy") - DECAY_PER_TICK.energy * ticks);
  return { ...state, satiety, mood, energy, lasttick: now };
}

/** 表情派生：睡 > 饿 > 难过 > 开心 > 平静。 */
function face(state) {
  if (state.energy < 15) return "😴";
  if (state.satiety < 25) return "😾";
  if (state.mood < 25) return "😿";
  if (state.mood > 70 && state.satiety > 50) return "😸";
  return "😺";
}

function note(state) {
  if (state.energy < 15) return "困得睁不开眼了……";
  if (state.satiety < 25) return "碗是空的，它在盯着你。";
  if (state.mood < 25) return "心情不太好，需要撸一撸。";
  if (state.mood > 70 && state.satiety > 50) return "尾巴翘得很高。";
  return "在窗边晒太阳。";
}

function finalize(state) {
  return { ...state, face: face(state), note: note(state) };
}

greywork.registerAction("settle", (state) => {
  return finalize(settle(state, Date.now()));
});

greywork.registerAction("pet", (state) => {
  const next = settle(state, Date.now());
  return finalize({
    ...next,
    mood: clamp(next.mood + PET_MOOD_GAIN),
    petcount: num(next, "petcount") + 1,
  });
});

greywork.registerAction("feed", (state) => {
  const next = settle(state, Date.now());
  return finalize({ ...next, satiety: clamp(next.satiety + FEED_GAIN) });
});

greywork.registerAction("rest", (state) => {
  const next = settle(state, Date.now());
  return finalize({ ...next, energy: clamp(next.energy + REST_GAIN) });
});
