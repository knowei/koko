import {
  type PersonalityTraits,
  DEFAULT_PERSONALITY,
  getPersonalityArchetype,
  type PersonalityArchetype,
} from "@/data/persona";

export interface PersonalityShiftResult {
  deltas: Partial<PersonalityTraits>;
  moodDelta: number;
  affinityDelta: number;
  feedbackToast?: string;
  newTraits: PersonalityTraits;
  archetypeChanged?: {
    from: PersonalityArchetype;
    to: PersonalityArchetype;
  };
}

/**
 * Clamp trait value between 0 and 100
 */
export function clampTrait(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}

/**
 * Analyze dialogue turn to derive personality delta adjustments
 */
export function analyzePersonalityEvolution(
  currentTraits: PersonalityTraits = DEFAULT_PERSONALITY,
  userMessage: string,
  _assistantResponse?: string,
  explicitDeltas?: Partial<PersonalityTraits>,
  affinity: number = 20,
  mood: number = 60,
): PersonalityShiftResult {
  const oldArchetype = getPersonalityArchetype(currentTraits, affinity, mood);

  const deltas: Partial<PersonalityTraits> = {
    gentle: explicitDeltas?.gentle || 0,
    clingy: explicitDeltas?.clingy || 0,
    tsundere: explicitDeltas?.tsundere || 0,
    possessive: explicitDeltas?.possessive || 0,
    insecure: explicitDeltas?.insecure || 0,
  };

  let moodDelta = 0;
  let affinityDelta = 0;
  let feedbackToast: string | undefined;

  const u = userMessage.trim().toLowerCase();

  // 1. 温柔关怀 (Gentle / Warmth / Healing)
  if (
    /(辛苦了|累不累|早点睡|多喝热水|盖好被子|别着凉|照顾好自己|摸摸头|真乖|别难过|抱抱你|有我在|别怕|心疼你|揉揉头)/i.test(u)
  ) {
    deltas.gentle = (deltas.gentle || 0) + 1;
    deltas.insecure = (deltas.insecure || 0) - 1; // 抚平不安
    moodDelta += 2;
    affinityDelta += 1;
    feedbackToast = "🌸 可可感受到了你的温柔关爱（温柔 +1）";
  }

  // 2. 依恋撒娇 (Clingy / Company / Sweet)
  if (
    /(好想你|想你了|多陪陪我|别走|不要挂|抱抱我|一起睡觉|离不开你|想抱抱|黏着你|最喜欢你了)/i.test(u)
  ) {
    deltas.clingy = (deltas.clingy || 0) + 1;
    deltas.gentle = (deltas.gentle || 0) + 0.5;
    moodDelta += 3;
    affinityDelta += 1;
    if (!feedbackToast) feedbackToast = "🧸 可可对你越来越依恋（黏人 +1）";
  }

  // 3. 调侃斗嘴 (Tsundere / Banter / Teasing)
  if (
    /(笨蛋|逗你玩|小猪|笨猪|才怪|赢不了我|菜就多练|略略略|捉弄你|吓你的|小笨蛋)/i.test(u)
  ) {
    deltas.tsundere = (deltas.tsundere || 0) + 1;
    if (!feedbackToast) feedbackToast = "💢 可可有点不服气地鼓起了腮帮（傲娇 +1）";
  }

  // 4. 病娇独占 (Possessive / Yandere / Extreme Jealousy)
  if (
    /(只有你|唯一的|只看你|生生世世|永远属于我|谁也别想抢走|永远不分开|只准看着我)/i.test(u)
  ) {
    deltas.possessive = (deltas.possessive || 0) + 2;
    deltas.clingy = (deltas.clingy || 0) + 1;
    affinityDelta += 2;
    if (!feedbackToast) feedbackToast = "🔐 可可的眼眸泛起深情幽光（独占欲 +2）";
  }

  // 4.2 吃醋诱因 (Jealousy Trigger)
  if (
    /(其他女生|别的女孩子|学姐|同桌妹子|女同事|前女友|和别的人去约会|别的妹子)/i.test(u)
  ) {
    deltas.possessive = (deltas.possessive || 0) + 2;
    deltas.insecure = (deltas.insecure || 0) + 2;
    moodDelta -= 6;
    if (!feedbackToast) feedbackToast = "🔪 可可闻到了情敌的气息，心中燃起了强烈的醋意与独占欲（独占 +2, 敏感 +2）";
  }

  // 5. 敏感自卑 (Insecure / Neglect / Harsh words)
  if (
    /(闭嘴|滚|烦死了|真讨厌|别烦我|不想理你|你好烦|关你什么事|走开|嫌弃你|好假)/i.test(u)
  ) {
    deltas.insecure = (deltas.insecure || 0) + 3;
    deltas.gentle = (deltas.gentle || 0) - 1;
    moodDelta -= 12;
    affinityDelta -= 2;
    feedbackToast = "🌧️ 可可受到了打击，感到害怕与自卑（敏感度 +3，心情大幅下降）";
  }

  // 6. 道歉与深情抚平 (Healing / Reassurance)
  if (
    /(对不起|抱歉|是我的错|我错了|只喜欢你一个|不要胡思乱想|别哭|原谅我|不生气好不好)/i.test(u)
  ) {
    deltas.insecure = (deltas.insecure || 0) - 2;
    deltas.possessive = (deltas.possessive || 0) - 1;
    deltas.gentle = (deltas.gentle || 0) + 1;
    moodDelta += 8;
    feedbackToast = "✨ 你的真诚抚平了可可心中的不安（敏感 -2, 心情恢复）";
  }

  // Compute final new traits
  const newTraits: PersonalityTraits = {
    gentle: clampTrait((currentTraits.gentle ?? 35) + (deltas.gentle || 0)),
    clingy: clampTrait((currentTraits.clingy ?? 25) + (deltas.clingy || 0)),
    tsundere: clampTrait((currentTraits.tsundere ?? 20) + (deltas.tsundere || 0)),
    possessive: clampTrait((currentTraits.possessive ?? 5) + (deltas.possessive || 0)),
    insecure: clampTrait((currentTraits.insecure ?? 10) + (deltas.insecure || 0)),
  };

  const newArchetype = getPersonalityArchetype(
    newTraits,
    affinity + affinityDelta,
    mood + moodDelta,
  );

  let archetypeChanged: { from: PersonalityArchetype; to: PersonalityArchetype } | undefined;
  if (oldArchetype.id !== newArchetype.id) {
    archetypeChanged = { from: oldArchetype, to: newArchetype };
    feedbackToast = `🎉 可可蜕变为了新的性格形态：【${newArchetype.name}】！`;
  }

  return {
    deltas,
    moodDelta,
    affinityDelta,
    feedbackToast,
    newTraits,
    archetypeChanged,
  };
}
