/**
 * Generate 2-3 compact, contextual reply suggestions based on the sister's latest response
 * Strictly uses custom configured profile.name and profile.userNickname.
 */
export function generateSuggestions(
  lastAssistantMsg: string,
  profile: { name: string; userNickname: string },
  mood: number,
  affinity = 5,
  hour = new Date().getHours(),
): string[] {
  const name = profile.name || "可可";
  const user = profile.userNickname || "哥哥";
  const text = lastAssistantMsg ? lastAssistantMsg.trim() : "";
  const isClose = affinity >= 45;

  if (!text) {
    return [
      `摸摸${name}的头`,
      `${name}今天在干嘛呢？`,
      isClose ? `最喜欢${name}啦` : `想听${name}说说话`,
    ];
  }

  // 1. Questions regarding tired / work / exhaustion
  if (/(累不累|辛苦|加班|工作|累|忙|休息)/.test(text)) {
    return [
      isClose ? `超累的，快让我抱抱${name}充充电~` : `有点累呢，想休息一下`,
      `今天还好，${name}今天过得怎么样？`,
      `看到${name}就不觉得累啦`,
    ];
  }

  // 2. Questions regarding food / meal / cooking / eating
  if (/(吃|饭|饿|夜宵|零食|早餐|午餐|晚餐|甜点|做饭|煮)/.test(text)) {
    return [
      `想吃${name}亲手做的好吃的~`,
      `${name}吃过了吗？别饿肚子哦`,
      `今天带${name}去吃好吃的！`,
    ];
  }

  // 3. Affection / missing / clinginess
  if (/(想我|喜欢|爱|在一起|陪|离开|别走|黏|抱)/.test(text)) {
    return [
      `我也最喜欢${name}了呀`,
      `当然想你啦，每天都在想`,
      `来，到${user}身边来`,
    ];
  }

  // 4. Night / bedtime / sleepy
  if (hour >= 22 || hour < 6 || /(困|睡|晚安|做梦|被窝|熬夜|梦到)/.test(text)) {
    return [
      `好啦，${name}快盖好被子睡觉觉吧`,
      `${name}今晚要梦到我哦，晚安~`,
      `再陪${name}说一小会儿话就睡`,
    ];
  }

  // 5. Outings / going out / movie / playing
  if (/(出门|去哪|玩|电影|公园|周末|散步|约会|一起去)/.test(text)) {
    return [
      `好呀，${name}想去哪里我都陪你`,
      `周末我们一起出去走走吧！`,
      `只要和${name}在一起，去哪都开心`,
    ];
  }

  // 6. Sadness / comforting / crying / low mood
  if (mood < 40 || /(难过|哭|委屈|害怕|担心|欺负|不开心|呜)/.test(text)) {
    return [
      `乖，有${user}在呢，别害怕`,
      `给${name}一个大大的拥抱`,
      `跟${user}说说怎么啦，我替你出气`,
    ];
  }

  // 7. General question / inquiry (？ / 吗 / 呢 / 呀 / 么)
  if (/[？?吗呢呀么]/.test(text)) {
    return [
      `好呀，听${name}的安排~`,
      `让${user}好好想一想哦`,
      `${name}觉得怎么样呢？`,
    ];
  }

  // 8. General playful & affectionate sibling default
  return [
    `${name}今天也超级可爱呢`,
    `今天在家有没有乖乖听话？`,
    `（轻轻捏了捏${name}的脸蛋）`,
  ];
}
