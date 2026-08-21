export interface QuizQuestion {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  companionChoice: "A" | "B";
  reactionA: string;
  reactionB: string;
}

export const QUIZ_POOL: QuizQuestion[] = [
  {
    id: "q_watermelon",
    question: "夏天吃冰镇西瓜，最甜最中间的那一勺你会？",
    optionA: "挖出来第一口喂给妹妹吃",
    optionB: "自己先大口吃掉然后得意地馋她",
    companionChoice: "A",
    reactionA: "哇！我就知道你最宠我啦，心里甜滋滋的~",
    reactionB: "哼！大坏蛋，就知道欺负我，看我不抢你的！",
  },
  {
    id: "q_rainy_day",
    question: "周末窗外突然下起暴雨，最舒服的度过方式是？",
    optionA: "窝在暖暖的毛毯里一起看治愈老电影",
    optionB: "站在窗台前听着雨声吸溜热腾腾的泡面",
    companionChoice: "A",
    reactionA: "对呀对呀！靠在一起看电影最惬意安心了~",
    reactionB: "听雨吃泡面也很有意境呢，不过要加个荷包蛋哦！",
  },
  {
    id: "q_amusement",
    question: "两个人一起去游乐园，进门第一个想玩的是？",
    optionA: "惊险刺激的云霄过山车",
    optionB: "浪漫梦幻的双层旋转木马",
    companionChoice: "B",
    reactionA: "欸？！过山车好高呀…那你一定要牢牢牵着我的手！",
    reactionB: "旋转木马！在最高点的时候我们一起拍照好不好~",
  },
  {
    id: "q_midnight_snack",
    question: "深夜肚子咕咕叫了，最想吃的夜宵是？",
    optionA: "香喷喷滋滋冒油的炸鸡烧烤",
    optionB: "热气腾腾清甜暖胃的鲜虾小馄饨",
    companionChoice: "A",
    reactionA: "炸鸡万岁！偶尔放肆一下，长胖的事明天再说啦~",
    reactionB: "好暖胃的选项，吃完胃里暖洋洋的刚好睡觉觉。",
  },
  {
    id: "q_superpower",
    question: "如果世界上真的有超能力，你最想拥有哪一个？",
    optionA: "瞬间移动（随时能出现在对方面前）",
    optionB: "读心术（一眼就能看透她在想什么）",
    companionChoice: "A",
    reactionA: "太棒了！这样只要我想你，你下一秒就能飞过来啦！",
    reactionB: "读心术吗？呜…那我的小心思岂不是全被你发现啦！",
  },
  {
    id: "q_horror_movie",
    question: "看悬疑电影看到最吓人的一幕音效突起时？",
    optionA: "一把将她护在怀里挡住视线",
    optionB: "趁机故意轻拍她肩膀吓她一跳",
    companionChoice: "A",
    reactionA: "（脸红扑进怀里）虽然害怕，但是被抱住瞬间就安心了…",
    reactionB: "（气呼呼掐你胳膊）我就知道你要吓我！大坏蛋！",
  },
  {
    id: "q_beach_trip",
    question: "夏天一起去海边度假，最期待做的事情是？",
    optionA: "傍晚赤脚踩水捡贝壳、看橘粉色落日夕阳",
    optionB: "换上海滩泳装尽情打水仗、晒阳光浴",
    companionChoice: "A",
    reactionA: "夕阳下的海浪最温柔了，我们要拍好多好多张合影！",
    reactionB: "嘿嘿，打水仗的话我可不会手下留情哦！",
  },
];

export function getRandomQuiz(count = 5): QuizQuestion[] {
  const shuffled = [...QUIZ_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
