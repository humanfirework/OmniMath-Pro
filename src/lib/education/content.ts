/**
 * OmniMath Pro — 青少年身心健康教育模块 · 内容库
 *
 * 「每日一题」的题库与元数据。原则：先易后难、天天不断、贴近生活、看见图形。
 * 所有题目均可离线本地校验，不依赖网络 / AI / 登录。
 *
 * 题型（question.kind）：
 *  - 'numeric'    用户输入一个数值，与 answer 做容差比较。
 *  - 'expression' 用户输入一个含变量的表达式，在若干测试点数值采样后比较。
 *  - 'choice'     四选一，适合低龄 / 概念题，零门槛。
 */

export type QuestionLevel = 1 | 2 | 3 | 4;
export type QuestionKind = 'numeric' | 'expression' | 'choice' | 'problem';

/**
 * 学段（年龄段）：
 *  - primary    小学 —— 口算、分数、图形等基础，贴近生活。
 *  - middle     初中 —— 函数入门、几何、简单方程、概率初步。
 *  - high       高中 —— 微积分初步、统计、极值、数列。
 *  - university 大学/高等 —— 线性代数、高等数学、概率统计，可与求解器/线性代数工具联动。
 */
export type QuestionStage = 'primary' | 'middle' | 'high' | 'university';

export const STAGES: QuestionStage[] = ['primary', 'middle', 'high', 'university'];

export const STAGE_LABEL: Record<QuestionStage, string> = {
  primary: '小学',
  middle: '初中',
  high: '高中',
  university: '大学 / 高等',
};

/** 解答题（kind='problem'）的一个「得分点」：每个步骤独立给分，组成评分细则。 */
export interface ProblemPart {
  /** 步骤 / 得分点说明（可含 $...$ LaTeX）。 */
  step: string;
  /** 该步骤满分（建议与题目总分匹配）。 */
  points: number;
  /** 该步骤的参考答案（可含 $...$ LaTeX）。 */
  answer: string;
}

export interface Question {
  /** 稳定 id（用于每日选题与错题本索引）。 */
  id: string;
  /** 难度 1–4 星（4 星为思维 / 奥数 / 挑战题）。 */
  level: QuestionLevel;
  /** 学段（未显式设置时按难度推导：1 星→小学，2 星→初中，3 星→高中，4 星→高中）。 */
  stage?: QuestionStage;
  /** 主题标签（如「生活里的函数」「图形之美」）。 */
  topic: string;
  /** 题目正文（支持内联 $...$ LaTeX）。 */
  text: string;
  /** 面向心态的鼓励语（不评判结果）。 */
  encouragement: string;
  /** 题型。 */
  kind: QuestionKind;
  /* ── 依据 kind 使用的字段 ─────────────────────────── */
  /** numeric：标准答案；expression：标准表达式。 */
  answer?: number | string;
  /** choice：选项列表。 */
  options?: string[];
  /** choice：正确选项下标。 */
  correctIndex?: number;
  /** problem：分步评分细则（解答题用于自评给分）。 */
  parts?: ProblemPart[];
  /** 答案的 LaTeX 展示（核对时显示）。 */
  answerLatex?: string;
  /** 提示（卡住时给「差一点点」的引导）。 */
  hint?: string;
  /** 逐步讲解（解答后展示，降低挫败感）。 */
  solution: string[];
  /** 可选：建议在 2D 绘图区查看的表达式（让抽象变看得见）。 */
  plotExpression?: string;
  /** 可联动的工作台工具：'linalg' 线性代数 / 'solver' 求解器 / 'stats' 统计。 */
  tools?: Array<'linalg' | 'solver' | 'stats'>;
}

/**
 * 题库：按难度分层。
 * L1 热身（1 星）：口算、代入求值、简单方程 —— 让「开始」毫无压力。
 * L2 探索（2 星）：函数图像、几何、生活应用题 —— 开始「看得见」数学。
 * L3 进阶（3 星）：微积分初步、概率统计 —— 为有基础的青少年提供挑战。
 */
export const QUESTION_BANK: Question[] = [
  /* ═══════════════ L1 · 热身（1 星） ═══════════════ */
  {
    id: 'l1-01',
    level: 1,
    topic: '口算热身',
    text: '小明去文具店买了 3 支铅笔，每支 $2$ 元，还买了一本 $5$ 元的本子。他一共花了多少元？',
    encouragement: '把数字排好队，答案就会自己跑出来。你行的！',
    kind: 'numeric',
    answer: 11,
    answerLatex: '3 \\times 2 + 5 = 11',
    hint: '先算 3 支铅笔的钱，再加上本子的钱。',
    solution: [
      '先算铅笔的总价：$3 \\times 2 = 6$（元）。',
      '再加上本子的钱：$6 + 5 = 11$（元）。',
      '所以一共花了 $11$ 元。',
    ],
  },
  {
    id: 'l1-02',
    level: 1,
    topic: '口算热身',
    text: '$25 + 18$ 等于多少？',
    encouragement: '一步一步来，先算十位再算个位。',
    kind: 'numeric',
    answer: 43,
    answerLatex: '25 + 18 = 43',
    hint: '$25+10=35$，再 $+8=43$。',
    solution: [
      '个位：$5+8=13$，写 $3$ 进 $1$。',
      '十位：$2+1+1=4$。',
      '结果是 $43$。',
    ],
  },
  {
    id: 'l1-03',
    level: 1,
    topic: '口算热身',
    text: '算式 $64 - 29$ 的结果是多少？',
    encouragement: '退位不可怕，借一位就好。',
    kind: 'numeric',
    answer: 35,
    answerLatex: '64 - 29 = 35',
    hint: '$64-30=-6$，再 $+1$。',
    solution: [
      '个位不够减，向十位借 $1$：$14-9=5$。',
      '十位：$6$ 被借走 $1$ 剩 $5$，$5-2=3$。',
      '结果是 $35$。',
    ],
  },
  {
    id: 'l1-04',
    level: 1,
    topic: '生活里的数学',
    text: '一个蛋糕平均切成 8 块，小明吃了 3 块。剩下的块数占全部蛋糕的几分之几？请用最简分数表示（如 5/8）。',
    encouragement: '分蛋糕就是把「整体」分成「份」。',
    kind: 'numeric',
    answer: 5 / 8,
    answerLatex: '\\frac{5}{8}',
    hint: '先算剩下几块，再写成「剩下的块数 / 总块数」。',
    solution: [
      '总共 8 块，吃了 3 块：$8-3=5$（块）。',
      '剩下的占全部：$\\frac{5}{8}$。',
      '这就是最简分数，答案是 $\\frac{5}{8}$。',
    ],
  },
  {
    id: 'l1-05',
    level: 1,
    topic: '生活里的数学',
    text: '一根跳绳长 2 米。3 根这样的跳绳接在一起，一共长多少米？',
    encouragement: '「每根 × 几根」就是总数。',
    kind: 'numeric',
    answer: 6,
    answerLatex: '2 \\times 3 = 6',
    hint: '每根 2 米，有 3 根。',
    solution: [
      '一根 2 米，3 根就是 $2 \\times 3$。',
      '结果是 $6$ 米。',
    ],
  },
  {
    id: 'l1-06',
    level: 1,
    topic: '图形之美',
    text: '一个正方形的边长是 5 厘米，它的面积是多少平方厘米？',
    encouragement: '正方形「边乘边」，就是它的面积。',
    kind: 'numeric',
    answer: 25,
    answerLatex: '5 \\times 5 = 25',
    hint: '面积 = 边长 × 边长。',
    solution: [
      '正方形面积 = 边长 $\\times$ 边长。',
      '$5 \\times 5 = 25$。',
      '面积是 $25$ 平方厘米。',
    ],
  },
  {
    id: 'l1-07',
    level: 1,
    topic: '口算热身',
    text: '解方程：$x + 7 = 15$，$x$ 等于多少？',
    encouragement: '把「加 7」移到另一边，就变成「减 7」。',
    kind: 'numeric',
    answer: 8,
    answerLatex: 'x = 8',
    hint: '两边同时减 7。',
    solution: [
      '方程两边同时减 7：$x+7-7=15-7$。',
      '得到 $x = 8$。',
    ],
  },
  {
    id: 'l1-08',
    level: 1,
    topic: '口算热身',
    text: '计算：$12 \\times 4$ 等于多少？',
    encouragement: '想想 $10\\times4$ 和 $2\\times4$ 加起来。',
    kind: 'numeric',
    answer: 48,
    answerLatex: '12 \\times 4 = 48',
    hint: '$10\\times4=40$，$2\\times4=8$。',
    solution: [
      '$12 \\times 4 = (10+2)\\times4$。',
      '$10\\times4=40$，$2\\times4=8$。',
      '$40+8=48$。',
    ],
  },
  {
    id: 'l1-09',
    level: 1,
    topic: '概念巩固',
    text: '下面哪一个数是最小的质数？',
    encouragement: '质数就是「只有 1 和它本身两个因数」的数。',
    kind: 'choice',
    options: ['1', '2', '4', '6'],
    correctIndex: 1,
    answerLatex: '2',
    hint: '1 不是质数，最小的质数是 2。',
    solution: [
      '质数的定义：只有 1 和它本身两个因数的自然数。',
      '1 只有 1 一个因数，不是质数。',
      '2 的因数是 1 和 2，所以最小的质数是 2。',
    ],
  },
  {
    id: 'l1-10',
    level: 1,
    topic: '概念巩固',
    text: '一个数的因数里，包含 1 和它本身。下面哪个说法是正确的？',
    encouragement: '别着急，把每个选项都想一想。',
    kind: 'choice',
    options: [
      '所有数都有无数个因数',
      '一个数的因数是有限的',
      '每个数都只有一个因数',
      '因数一定比这个数大',
    ],
    correctIndex: 1,
    answerLatex: '\\text{一个数的因数是有限的}',
    hint: '因数是一对一对出现的，数量一定有限。',
    solution: [
      '因数：能整除这个数的自然数。',
      '因数总是有限的，比如 12 的因数是 1、2、3、4、6、12。',
      '所以「一个数的因数是有限的」是正确的。',
    ],
  },

  /* ═══════════════ L2 · 探索（2 星） ═══════════════ */
  {
    id: 'l2-01',
    level: 2,
    topic: '函数入门',
    text: '小明的身高（厘米）随年龄（岁）增长，可以用式子 $h = 60 + 8t$ 表示（$t$ 为年龄）。当 $t = 5$ 岁时，身高是多少厘米？',
    encouragement: '把数字「代入」式子，就像给公式插上电。',
    kind: 'numeric',
    answer: 100,
    answerLatex: '60 + 8 \\times 5 = 100',
    hint: '把 $t$ 换成 $5$，再按顺序计算。',
    solution: [
      '把 $t=5$ 代入 $h=60+8t$。',
      '$h=60+8\\times5=60+40=100$。',
      '所以身高是 $100$ 厘米。',
    ],
    plotExpression: '60 + 8*x',
  },
  {
    id: 'l2-02',
    level: 2,
    topic: '生活里的函数',
    text: '出租车起步价 10 元，之后每公里 2 元。坐 $x$ 公里（$x>0$）的总费用 $y$ 可以用式子 $y = 10 + 2x$ 表示。坐 6 公里要花多少元？',
    encouragement: '「起步价 + 每公里钱 × 公里数」就是总价。',
    kind: 'numeric',
    answer: 22,
    answerLatex: '10 + 2 \\times 6 = 22',
    hint: '代入 $x=6$。',
    solution: [
      '代入 $x=6$：$y=10+2\\times6$。',
      '$y=10+12=22$。',
      '所以坐 6 公里要花 $22$ 元。',
    ],
    plotExpression: '10 + 2*x',
  },
  {
    id: 'l2-03',
    level: 2,
    topic: '函数入门',
    text: '函数 $f(x) = 3x - 2$。当 $x = 4$ 时，$f(x)$ 等于多少？',
    encouragement: '$f(x)$ 就是把 $x$ 放进一个「函数机器」。',
    kind: 'numeric',
    answer: 10,
    answerLatex: 'f(4) = 3\\times4 - 2 = 10',
    hint: '把 $x$ 换成 $4$。',
    solution: [
      '$f(4) = 3\\times4 - 2$。',
      '$=12-2=10$。',
      '所以 $f(4)=10$。',
    ],
    plotExpression: '3*x - 2',
  },
  {
    id: 'l2-04',
    level: 2,
    topic: '图形之美',
    text: '一个圆的半径是 3 厘米，它的周长是多少厘米？$\\pi$ 取 $3.14$。',
    encouragement: '圆规画一圈，周长用公式「2πr」算。',
    kind: 'numeric',
    answer: 18.84,
    answerLatex: '2 \\times 3.14 \\times 3 = 18.84',
    hint: '周长 $= 2\\pi r$。',
    solution: [
      '周长公式 $C=2\\pi r$。',
      '$C=2\\times3.14\\times3$。',
      '$C=18.84$ 厘米。',
    ],
  },
  {
    id: 'l2-05',
    level: 2,
    topic: '概率初步',
    text: '一个袋子里有 3 个红球和 1 个蓝球（大小相同），闭上眼睛摸出一个球，摸到蓝球的概率是多少？',
    encouragement: '「想要的 ÷ 总共的」就是概率。',
    kind: 'numeric',
    answer: 1 / 4,
    answerLatex: '\\frac{1}{4}',
    hint: '蓝球有 1 个，球一共有 4 个。',
    solution: [
      '总共 $3+1=4$ 个球。',
      '蓝球有 1 个。',
      '概率 $=\\frac{1}{4}$。',
    ],
  },
  {
    id: 'l2-06',
    level: 2,
    topic: '图形之美',
    text: '三角形的三边分别是 $3$、$4$、$5$（单位：厘米）。它是不是直角三角形？（填 1 表示是，0 表示否）',
    encouragement: '「勾三股四弦五」是经典的直角。',
    kind: 'numeric',
    answer: 1,
    answerLatex: '3^2+4^2 = 5^2',
    hint: '检查 $a^2+b^2$ 是否等于 $c^2$。',
    solution: [
      '检验勾股定理：$3^2+4^2=9+16=25$。',
      '$5^2=25$，相等。',
      '所以是直角三角形（填 1）。',
    ],
  },
  {
    id: 'l2-07',
    level: 2,
    topic: '生活里的函数',
    text: '小明存钱，第 1 周存 10 元，以后每周都比上周多存 5 元。第 $n$ 周存的钱可以用式子 $10 + 5(n-1)$ 表示。第 6 周存多少元？',
    encouragement: '找规律，然后让公式帮你算。',
    kind: 'numeric',
    answer: 35,
    answerLatex: '10 + 5\\times(6-1) = 35',
    hint: '代入 $n=6$。',
    solution: [
      '代入 $n=6$：$10+5\\times(6-1)$。',
      '$=10+5\\times5=10+25=35$。',
      '第 6 周存 $35$ 元。',
    ],
    plotExpression: '10 + 5*(x-1)',
  },
  {
    id: 'l2-08',
    level: 2,
    topic: '函数入门',
    text: '解方程：$2x + 3 = 11$，$x$ 等于多少？',
    encouragement: '先去掉加法，再去掉倍数，$x$ 就现身了。',
    kind: 'numeric',
    answer: 4,
    answerLatex: 'x = 4',
    hint: '两边先减 3，再除以 2。',
    solution: [
      '两边减 3：$2x=8$。',
      '两边除以 2：$x=4$。',
    ],
    plotExpression: '2*x + 3',
  },

  /* ═══════════════ L3 · 进阶（3 星） ═══════════════ */
  {
    id: 'l3-01',
    level: 3,
    topic: '微积分初步',
    text: '求函数 $f(x) = x^2$ 在 $x = 3$ 处的导数 $f\'(3)$ 等于多少？',
    encouragement: '导数就是「瞬时变化率」，也叫斜率。',
    kind: 'numeric',
    answer: 6,
    answerLatex: "f'(x)=2x \\Rightarrow f'(3)=6",
    hint: '$x^2$ 的导数是 $2x$。',
    solution: [
      '幂函数求导：$f\'(x)=2x$。',
      '代入 $x=3$：$f\'(3)=2\\times3=6$。',
      '所以 $f\'(3)=6$。',
    ],
    plotExpression: 'x^2',
  },
  {
    id: 'l3-02',
    level: 3,
    topic: '微积分初步',
    text: '求 $x^3$ 对 $x$ 的导数。请输出结果（例如 3*x^2 这样的表达式）。',
    encouragement: '「把指数拿下来当系数，指数再减 1」。',
    kind: 'expression',
    answer: '3*x^2',
    answerLatex: '\\frac{d}{dx}x^3 = 3x^2',
    hint: '幂法则：$x^n$ 的导数是 $n\\,x^{n-1}$。',
    solution: [
      '幂法则：$\\frac{d}{dx}x^n = n x^{n-1}$。',
      '这里 $n=3$。',
      '结果是 $3x^2$。',
    ],
    plotExpression: 'x^3',
  },
  {
    id: 'l3-03',
    level: 3,
    topic: '概率统计',
    text: '投掷一枚公平的骰子两次，两次点数之和为 7 的概率是多少？（用分数表示，如 1/6）',
    encouragement: '列出所有「和为 7」的可能，数一数。',
    kind: 'numeric',
    answer: 1 / 6,
    answerLatex: '\\frac{6}{36} = \\frac{1}{6}',
    hint: '和为 7 的组合有 (1,6)(2,5)(3,4)(4,3)(5,2)(6,1) 共 6 种。',
    solution: [
      '两次共有 $6\\times6=36$ 种等可能结果。',
      '和为 7 的有 6 种：(1,6)(2,5)(3,4)(4,3)(5,2)(6,1)。',
      '概率 $=\\frac{6}{36}=\\frac{1}{6}$。',
    ],
  },
  {
    id: 'l3-04',
    level: 3,
    topic: '微积分初步',
    text: '求定积分 $\\int_0^2 x\\,dx$ 的值。',
    encouragement: '定积分算的是曲线下的「面积」。',
    kind: 'numeric',
    answer: 2,
    answerLatex: '\\int_0^2 x\\,dx = \\frac{x^2}{2}\\Big|_0^2 = 2',
    hint: '$\\int x\\,dx = \\frac{x^2}{2}$，再代入上下限。',
    solution: [
      '$\\int x\\,dx = \\frac{x^2}{2}$。',
      '代入上下限：$\\frac{2^2}{2}-\\frac{0^2}{2}=\\frac{4}{2}=2$。',
      '所以积分为 $2$。',
    ],
    plotExpression: 'x',
  },
  {
    id: 'l3-05',
    level: 3,
    topic: '概率统计',
    text: '某班 5 名同学的数学成绩是：$80, 85, 90, 95, 100$。这组数据的平均分是多少？',
    encouragement: '平均分就是「总分 ÷ 人数」。',
    kind: 'numeric',
    answer: 90,
    answerLatex: '\\frac{80+85+90+95+100}{5}=90',
    hint: '先加总，再除以 5。',
    solution: [
      '总分：$80+85+90+95+100=450$。',
      '人数：5。',
      '平均分：$450\\div5=90$。',
    ],
  },
  {
    id: 'l3-06',
    level: 3,
    topic: '图形之美',
    text: '一个球的体积公式是 $V=\\frac{4}{3}\\pi r^3$。当半径 $r=3$ 时（$\\pi$ 取 $3.14$），体积最接近多少？四舍五入到个位。',
    encouragement: '公式很大，代入就好。',
    kind: 'numeric',
    answer: 113,
    answerLatex: 'V=\\frac{4}{3}\\times3.14\\times3^3 \\approx 113.04 \\approx 113',
    hint: '先算 $r^3=27$，再乘 $\\frac{4}{3}\\pi$。',
    solution: [
      '$r^3=3^3=27$。',
      '$V=\\frac{4}{3}\\times3.14\\times27$。',
      '$V\\approx113.04$，四舍五入到个位是 $113$。',
    ],
  },
  {
    id: 'l3-07',
    level: 3,
    topic: '微积分初步',
    text: '求函数 $f(x)=x^3-6x$ 的极值点。它的驻点（导数为 0 的 $x$）中，正的那个是多少？',
    encouragement: '先求导，再令导数为 0。',
    kind: 'numeric',
    answer: Math.sqrt(2),
    answerLatex: "f'(x)=3x^2-6=0 \\Rightarrow x=\\sqrt{2}",
    hint: "$f'(x)=3x^2-6$，令其等于 0。",
    solution: [
      "$f'(x)=3x^2-6$。",
      '令 $3x^2-6=0$，得 $x^2=2$。',
      '正的那个驻点是 $x=\\sqrt{2}\\approx1.414$。',
    ],
    plotExpression: 'x^3 - 6*x',
  },
  {
    id: 'l3-08',
    level: 3,
    topic: '概率统计',
    text: '一组数据 $2, 4, 6, 8, 10$ 的方差是多少？（保留一位小数）',
    encouragement: '方差衡量数据「波动多大」。',
    kind: 'numeric',
    answer: 8,
    answerLatex: '\\text{方差}=\\frac{(2-6)^2+(4-6)^2+(6-6)^2+(8-6)^2+(10-6)^2}{5}=8',
    hint: '先求平均数 6，再算各数据与平均数的差的平方的平均。',
    solution: [
      '平均数 $=\\frac{2+4+6+8+10}{5}=6$。',
      '各差平方：$16+4+0+4+16=40$。',
      '方差 $=\\frac{40}{5}=8$。',
    ],
  },

  /* ═══════════════ 大学 / 高等（4 星内容，可联动线代 / 求解器） ═══════════════ */
  {
    id: 'u1-01',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 矩阵',
    text: '设矩阵 $A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$，求 $A$ 的行列式 $\\det(A)$ 的值。',
    encouragement: '二阶行列式就是「主对角积 减 副对角积」。',
    kind: 'numeric',
    answer: -2,
    answerLatex: '\\det(A)=1\\times4-2\\times3=4-6=-2',
    hint: '$\\det(A)=ad-bc$，其中 $a=1,b=2,c=3,d=4$。',
    solution: [
      '二阶行列式公式：$\\det\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}=ad-bc$。',
      '代入：$1\\times4-2\\times3$。',
      '$=4-6=-2$。',
    ],
    tools: ['linalg'],
  },
  {
    id: 'u1-02',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 矩阵',
    text: '设 $A=\\begin{pmatrix}1&1\\\\0&1\\end{pmatrix}$，$B=\\begin{pmatrix}1&0\\\\1&1\\end{pmatrix}$，求 $AB$ 第 1 行第 2 列的元素。',
    encouragement: '矩阵乘法「行乘列」，新矩阵第 $i$ 行 $j$ 列是 $A$ 第 $i$ 行与 $B$ 第 $j$ 列的点积。',
    kind: 'numeric',
    answer: 1,
    answerLatex: '(AB)_{12}=1\\times0+1\\times1=1',
    hint: '(AB) 第 1 行第 2 列 = A 第 1 行 [1,1] 与 B 第 2 列 [0,1] 点积。',
    solution: [
      '矩阵乘法：$(AB)_{ij}$ 等于 $A$ 第 $i$ 行与 $B$ 第 $j$ 列的点积。',
      '第 1 行第 2 列：$A$ 第 1 行 $[1,1]$，$B$ 第 2 列 $[0,1]$。',
      '点积：$1\\times0+1\\times1=1$。',
    ],
    tools: ['linalg'],
  },
  {
    id: 'u1-03',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 向量',
    text: '向量 $\\vec{u}=(1,2)$，$\\vec{v}=(3,4)$，求它们的点积 $\\vec{u}\\cdot\\vec{v}$。',
    encouragement: '点积就是「对应分量相乘再相加」。',
    kind: 'numeric',
    answer: 11,
    answerLatex: '\\vec{u}\\cdot\\vec{v}=1\\times3+2\\times4=3+8=11',
    hint: '$u_x v_x + u_y v_y$。',
    solution: [
      '点积公式：$\\vec{u}\\cdot\\vec{v}=u_1v_1+u_2v_2$。',
      '代入：$1\\times3+2\\times4$。',
      '$=3+8=11$。',
    ],
    tools: ['linalg'],
  },
  {
    id: 'u1-04',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 特征值',
    text: '矩阵 $A=\\begin{pmatrix}2&0\\\\0&3\\end{pmatrix}$ 的特征值之和（即迹 $\\operatorname{tr}(A)$）是多少？',
    encouragement: '对角矩阵的特征值就是对角线上的元素。',
    kind: 'numeric',
    answer: 5,
    answerLatex: '\\operatorname{tr}(A)=2+3=5',
    hint: '特征值之和 = 主对角线元素之和（迹）。',
    solution: [
      '对角矩阵的特征值就是对角线元素：$2$ 和 $3$。',
      '特征值之和 $=2+3=5$（也等于迹）。',
    ],
    tools: ['linalg'],
  },
  {
    id: 'u1-05',
    level: 3,
    stage: 'university',
    topic: '高等数学 · 极限',
    text: '求极限 $\\lim_{x\\to 0} \\frac{\\sin x}{x}$ 的值。',
    encouragement: '这是微积分里的经典极限，记下它非常有用。',
    kind: 'numeric',
    answer: 1,
    answerLatex: '\\lim_{x\\to0}\\frac{\\sin x}{x}=1',
    hint: '经典重要极限，结果为 1。',
    solution: [
      '$\\lim_{x\\to0}\\frac{\\sin x}{x}=1$ 是重要极限。',
      '几何上，当 $x$ 很小时 $\\sin x \\approx x$。',
    ],
    tools: ['solver'],
  },
  {
    id: 'u1-06',
    level: 3,
    stage: 'university',
    topic: '高等数学 · 微分方程',
    text: '微分方程 $y\'=y$ 的解是 $y=Ce^x$。若初值 $y(0)=3$，求常数 $C$。',
    encouragement: '用初始条件确定任意常数 $C$。',
    kind: 'numeric',
    answer: 3,
    answerLatex: 'y(0)=Ce^0=C=3',
    hint: '把 $x=0,\\ y=3$ 代入 $y=Ce^x$，注意 $e^0=1$。',
    solution: [
      '通解：$y=Ce^x$。',
      '初值 $y(0)=3$：$3=Ce^0=C$。',
      '所以 $C=3$。',
    ],
    tools: ['solver'],
  },
  {
    id: 'u1-07',
    level: 3,
    stage: 'university',
    topic: '概率统计 · 期望',
    text: '随机变量 $X$ 取值 $1,2,3$，概率各为 $0.2,0.3,0.5$，求 $E[X]$。',
    encouragement: '期望就是「取值 × 概率」求和。',
    kind: 'numeric',
    answer: 2.3,
    answerLatex: 'E[X]=1\\times0.2+2\\times0.3+3\\times0.5=2.3',
    hint: '$E[X]=\\sum x_i p_i$。',
    solution: [
      '$E[X]=1\\times0.2+2\\times0.3+3\\times0.5$。',
      '$=0.2+0.6+1.5=2.3$。',
    ],
    tools: ['stats'],
  },
  {
    id: 'u1-08',
    level: 3,
    stage: 'university',
    topic: '概率统计 · 正态分布',
    text: '标准正态分布 $Z\\sim N(0,1)$ 的均值 $\\mu$ 是多少？',
    encouragement: '标准正态以 0 为中心，均值就是 0。',
    kind: 'numeric',
    answer: 0,
    answerLatex: '\\mu=0',
    hint: '标准正态 $N(0,1)$ 的均值就是参数 0。',
    solution: [
      '标准正态分布为 $N(0,1)$，其中 $\\mu=0$，$\\sigma=1$。',
      '所以均值是 $0$。',
    ],
    tools: ['stats'],
  },
  {
    id: 'u1-09',
    level: 3,
    stage: 'university',
    topic: '高等数学 · 定积分',
    text: '求定积分 $\\int_0^1 (3x^2+2x)\\,dx$ 的值。',
    encouragement: '先求原函数，再代入上下限（牛顿-莱布尼茨）。',
    kind: 'numeric',
    answer: 2,
    answerLatex: '\\int_0^1(3x^2+2x)\\,dx=[x^3+x^2]_0^1=1+1=2',
    hint: '$\\int 3x^2\\,dx=x^3$，$\\int 2x\\,dx=x^2$。',
    solution: [
      '求原函数：$\\int(3x^2+2x)\\,dx=x^3+x^2+C$。',
      '代入上下限：$[x^3+x^2]_0^1=(1+1)-(0+0)$。',
      '结果是 $2$。',
    ],
    tools: ['solver'],
  },
  {
    id: 'u1-10',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 逆矩阵',
    text: '矩阵 $A=\\begin{pmatrix}1&0\\\\0&2\\end{pmatrix}$ 的逆矩阵主对角线元素之和是多少？',
    encouragement: '对角矩阵的逆就是每个对角元素取倒数。',
    kind: 'numeric',
    answer: 1.5,
    answerLatex: 'A^{-1}=\\begin{pmatrix}1&0\\\\0&1/2\\end{pmatrix},\\ \\operatorname{tr}=1+\\tfrac{1}{2}=1.5',
    hint: '对角矩阵求逆：每个对角元素取倒数。',
    solution: [
      '对角矩阵的逆：$A^{-1}=\\begin{pmatrix}1&0\\\\0&1/2\\end{pmatrix}$。',
      '主对角线之和 $=1+\\tfrac{1}{2}=1.5$。',
    ],
    tools: ['linalg'],
  },

  /* ═══════════════ 选择题补充（保证每学段都有足够的「选择题」） ═══════════════ */

  /* 小学 */
  {
    id: 'l1-11',
    level: 1,
    topic: '概念巩固',
    text: '下面哪一个数是偶数？',
    encouragement: '偶数就是「能被 2 整除」的数，个位是 0、2、4、6、8。',
    kind: 'choice',
    options: ['3', '5', '8', '9'],
    correctIndex: 2,
    answerLatex: '8',
    hint: '看个位是不是 0、2、4、6、8。',
    solution: ['偶数的个位是 0、2、4、6、8。', '3、5、9 的个位都是奇数，只有 8 是偶数。'],
  },
  {
    id: 'l1-12',
    level: 1,
    topic: '口算热身',
    text: '$3 \\times 7$ 等于多少？',
    encouragement: '想想「三七二十一」。',
    kind: 'choice',
    options: ['18', '21', '24', '27'],
    correctIndex: 1,
    answerLatex: '3 \\times 7 = 21',
    hint: '乘法口诀：三七二十一。',
    solution: ['用乘法口诀：三七二十一。', '所以 $3 \\times 7 = 21$。'],
  },
  {
    id: 'l1-13',
    level: 1,
    topic: '生活里的数学',
    text: '1 小时等于多少分钟？',
    encouragement: '一小时有 60 分钟，一分钟有 60 秒。',
    kind: 'choice',
    options: ['50 分钟', '60 分钟', '90 分钟', '100 分钟'],
    correctIndex: 1,
    answerLatex: '1 \\text{小时} = 60 \\text{分钟}',
    hint: '想一想钟表上的一圈。',
    solution: ['时间单位：1 小时 = 60 分钟。', '所以答案是 60 分钟。'],
  },

  /* 初中 */
  {
    id: 'm2-01',
    level: 2,
    topic: '函数入门',
    text: '一次函数 $y = 2x + 1$，当 $x = 3$ 时，$y$ 等于多少？',
    encouragement: '把 $x$ 代入函数表达式即可。',
    kind: 'choice',
    options: ['5', '6', '7', '8'],
    correctIndex: 2,
    answerLatex: 'y = 2\\times3 + 1 = 7',
    hint: '代入 $x=3$：$2\\times3+1$。',
    solution: ['代入 $x=3$：$y=2\\times3+1$。', '$=6+1=7$。'],
  },
  {
    id: 'm2-02',
    level: 2,
    topic: '图形之美',
    text: '直角三角形的两条直角边分别是 $3$ 和 $4$，斜边长度是多少？',
    encouragement: '勾股定理：$a^2+b^2=c^2$。',
    kind: 'choice',
    options: ['5', '6', '7', '8'],
    correctIndex: 0,
    answerLatex: 'c=\\sqrt{3^2+4^2}=5',
    hint: '$3^2+4^2=25$，再开方。',
    solution: ['勾股定理：$c^2=3^2+4^2=9+16=25$。', '斜边 $c=\\sqrt{25}=5$。'],
  },
  {
    id: 'm2-03',
    level: 2,
    topic: '方程求解',
    text: '一元一次方程 $x - 5 = 9$ 的解是多少？',
    encouragement: '把「减 5」移到等号另一边就变成「加 5」。',
    kind: 'choice',
    options: ['4', '12', '14', '15'],
    correctIndex: 2,
    answerLatex: 'x = 14',
    hint: '两边同时加 5。',
    solution: ['两边加 5：$x=9+5$。', '$x=14$。'],
  },
  {
    id: 'm2-04',
    level: 2,
    topic: '概率初步',
    text: '抛一枚质地均匀的硬币一次，正面朝上的概率是多少？',
    encouragement: '「想要的 ÷ 总共的」就是概率。',
    kind: 'choice',
    options: ['0', '$\\tfrac{1}{2}$', '$\\tfrac{1}{3}$', '1'],
    correctIndex: 1,
    answerLatex: '\\frac{1}{2}',
    hint: '硬币只有正、反两面。',
    solution: ['硬币只有两个等可能结果：正、反。', '正面朝上的概率 $=\\frac{1}{2}$。'],
  },
  {
    id: 'm2-05',
    level: 2,
    topic: '统计初步',
    text: '一组数据 $2, 4, 6$ 的中位数是多少？',
    encouragement: '中位数就是按大小排好后「正中间」的数。',
    kind: 'choice',
    options: ['2', '4', '6', '5'],
    correctIndex: 1,
    answerLatex: '4',
    hint: '从小到大排，取中间那个。',
    solution: ['从小到大：$2,4,6$。', '中间的数是 $4$。'],
  },

  /* 高中 */
  {
    id: 'h3-01',
    level: 3,
    topic: '函数与方程',
    text: '函数 $f(x)=x^2-4$ 的零点的个数是？',
    encouragement: '零点就是图像与 $x$ 轴的交点。',
    kind: 'choice',
    options: ['0 个', '1 个', '2 个', '无数个'],
    correctIndex: 2,
    answerLatex: 'x^2-4=0 \\Rightarrow x=\\pm2',
    hint: '令 $x^2-4=0$，解出几个 $x$？',
    solution: ['令 $f(x)=0$：$x^2-4=0$。', '解得 $x=\\pm2$，共 2 个零点。'],
  },
  {
    id: 'h3-02',
    level: 3,
    topic: '数列',
    text: '等差数列 $1, 3, 5, 7, \\dots$ 的第 $10$ 项是多少？',
    encouragement: '通项公式 $a_n=a_1+(n-1)d$。',
    kind: 'choice',
    options: ['17', '19', '21', '23'],
    correctIndex: 1,
    answerLatex: 'a_{10}=1+9\\times2=19',
    hint: '公差 $d=2$，代入 $n=10$。',
    solution: ['首项 $1$，公差 $2$。', '$a_{10}=1+(10-1)\\times2=1+18=19$。'],
  },
  {
    id: 'h3-03',
    level: 3,
    topic: '微积分初步',
    text: '定积分 $\\int_0^1 x\\,dx$ 的值是？',
    encouragement: '定积分算的是曲线下的面积，这里是个三角形。',
    kind: 'choice',
    options: ['$\\tfrac{1}{2}$', '1', '0', '2'],
    correctIndex: 0,
    answerLatex: '\\int_0^1 x\\,dx = \\frac{x^2}{2}\\Big|_0^1=\\frac{1}{2}',
    hint: '$\\int x\\,dx=\\frac{x^2}{2}$，再代入上下限。',
    solution: ['$\\int x\\,dx=\\frac{x^2}{2}$。', '代入上下限：$\\frac{1^2}{2}-0=\\frac{1}{2}$。'],
  },
  {
    id: 'h3-04',
    level: 3,
    topic: '函数性质',
    text: '下列函数中，哪一个是偶函数？',
    encouragement: '偶函数关于 $y$ 轴对称，满足 $f(-x)=f(x)$。',
    kind: 'choice',
    options: ['$x^3$', '$\\sin x$', '$x^2$', '$\\tfrac{1}{x}$'],
    correctIndex: 2,
    answerLatex: 'f(-x)=(-x)^2=x^2=f(x)',
    hint: '检查 $f(-x)$ 是否等于 $f(x)$。',
    solution: ['偶函数满足 $f(-x)=f(x)$。', '$x^2$：$(-x)^2=x^2$，是偶函数。'],
  },
  {
    id: 'h3-05',
    level: 3,
    topic: '微积分初步',
    text: '可导函数在极值点处，其导数通常满足？',
    encouragement: '极值点处切线水平。',
    kind: 'choice',
    options: ['等于 0', '等于 1', '趋于无穷', '不存在'],
    correctIndex: 0,
    answerLatex: "f'(x_0)=0",
    hint: '费马引理：极值点处导数为 0。',
    solution: ['极值点处切线水平（斜率 0）。', '故 $f\'(x_0)=0$。'],
  },

  /* 大学 / 高等 */
  {
    id: 'u2-01',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 行列式',
    text: '单位矩阵 $I$（任意阶）的行列式 $\\det(I)$ 等于多少？',
    encouragement: '单位矩阵主对角线全 1，其余全 0。',
    kind: 'choice',
    options: ['0', '1', '-1', '2'],
    correctIndex: 1,
    answerLatex: '\\det(I)=1',
    hint: '单位矩阵是三角矩阵，行列式等于主对角线乘积 $1^n$。',
    solution: ['单位矩阵 $I$ 是上三角矩阵。', '行列式 $=$ 主对角线乘积 $=1\\times1\\times\\cdots=1$。'],
    tools: ['linalg'],
  },
  {
    id: 'u2-02',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 矩阵',
    text: '矩阵 $A=\\begin{pmatrix}2&0\\\\0&2\\end{pmatrix}$ 的行列式是多少？',
    encouragement: '对角矩阵的行列式就是主对角线元素相乘。',
    kind: 'choice',
    options: ['2', '4', '1', '0'],
    correctIndex: 1,
    answerLatex: '\\det(A)=2\\times2=4',
    hint: '对角矩阵行列式 = 各对角元素乘积。',
    solution: ['对角矩阵行列式 $=$ 主对角线乘积。', '$\\det(A)=2\\times2=4$。'],
    tools: ['linalg'],
  },
  {
    id: 'u2-03',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 可逆',
    text: '方阵 $A$ 可逆的充分必要条件是 $\\det(A)$？',
    encouragement: '可逆矩阵也叫非奇异矩阵。',
    kind: 'choice',
    options: ['等于 0', '不等于 0', '大于 0', '小于 0'],
    correctIndex: 1,
    answerLatex: '\\det(A)\\neq 0',
    hint: '行列式为 0 时矩阵奇异、不可逆。',
    solution: ['方阵 $A$ 可逆当且仅当 $\\det(A)\\neq0$。', '行列式不为 0，矩阵非奇异、可逆。'],
    tools: ['linalg'],
  },
  {
    id: 'u2-04',
    level: 3,
    stage: 'university',
    topic: '概率统计 · 正态分布',
    text: '标准正态分布 $Z\\sim N(0,1)$ 的方差是多少？',
    encouragement: '标准正态的均值 0、方差 1。',
    kind: 'choice',
    options: ['0', '1', '2', '3'],
    correctIndex: 1,
    answerLatex: '\\operatorname{Var}(Z)=1',
    hint: '标准正态 $N(0,1)$ 中第二个参数就是方差。',
    solution: ['标准正态记为 $N(0,1)$。', '其中 $\sigma^2=1$，即方差为 1。'],
    tools: ['stats'],
  },
  {
    id: 'u2-05',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 秩',
    text: '一个 $2\\times2$ 矩阵 $A$ 的秩最大可能为多少？',
    encouragement: '秩最多不超过行数或列数。',
    kind: 'choice',
    options: ['1', '2', '3', '4'],
    correctIndex: 1,
    answerLatex: '\\operatorname{rank}(A)\\le 2',
    hint: '矩阵的秩不超过行数或列数。',
    solution: ['矩阵的秩不超过行数或列数。', '对 $2\\times2$ 矩阵，秩 $\\le 2$，最大为 2。'],
    tools: ['linalg'],
  },

  /* ═══════════════ 解答题（kind='problem'，分步评分） ═══════════════ */

  {
    id: 'p1-01',
    level: 2,
    stage: 'middle',
    topic: '方程 · 应用题',
    text: '小华和小明共有 40 本书。小华的书比小明的 2 倍少 5 本。小明有多少本书？',
    encouragement: '先设未知数，再根据「共 40 本」和「2 倍少 5」列出方程。',
    kind: 'problem',
    answer: 15,
    answerLatex: 'x = 15',
    parts: [
      { step: '设未知数：设小明有 $x$ 本，则小华有 $2x-5$ 本。', points: 2, answer: '设 $x$ 为小明的书数，小华 $2x-5$。' },
      { step: '列方程：$x+(2x-5)=40$。', points: 3, answer: '$x+2x-5=40$。' },
      { step: '解方程：$3x=45$，$x=15$。', points: 3, answer: '$x=15$。' },
      { step: '检验并作答：小明 15 本，小华 25 本，合计 40 本，符合题意。', points: 2, answer: '小明有 $15$ 本。' },
    ],
    solution: [
      '设小明有 $x$ 本，则小华有 $2x-5$ 本。',
      '由「共 40 本」得方程 $x+(2x-5)=40$。',
      '解得 $3x=45$，$x=15$。',
      '验证：$15+(2\\times15-5)=15+25=40$。所以小明有 $15$ 本。',
    ],
    tools: ['solver'],
  },
  {
    id: 'p2-01',
    level: 3,
    stage: 'high',
    topic: '微积分 · 求极值',
    text: '已知函数 $f(x)=x^3-3x^2+2$，求它在区间 $[0,3]$ 上的最大值与最小值。',
    encouragement: '先求导找驻点，再比较端点与驻点处的函数值。',
    kind: 'problem',
    answerLatex: '\\max f=2,\\ \\min f=-2',
    parts: [
      { step: '求导：$f\'(x)=3x^2-6x=3x(x-2)$。', points: 3, answer: '$f\'(x)=3x(x-2)$。' },
      { step: '求驻点：令 $f\'(x)=0$，得 $x=0$ 或 $x=2$（都在 $[0,3]$ 内）。', points: 3, answer: '驻点 $x=0,2$。' },
      { step: '比较端值与驻点值：$f(0)=2,\\ f(2)=-2,\\ f(3)=2$。', points: 3, answer: '$f(0)=2,\\ f(2)=-2,\\ f(3)=2$。' },
      { step: '结论：最大值 $2$（在 $x=0,3$），最小值 $-2$（在 $x=2$）。', points: 1, answer: '最大值 $2$，最小值 $-2$。' },
    ],
    solution: [
      '$f\'(x)=3x^2-6x=3x(x-2)$。',
      '驻点 $x=0,2$；都落在区间 $[0,3]$。',
      '比较：$f(0)=2$，$f(2)=-2$，$f(3)=2$。',
      '故最大值为 $2$，最小值为 $-2$。',
    ],
    plotExpression: 'x^3 - 3*x^2 + 2',
    tools: ['solver'],
  },
  {
    id: 'p3-01',
    level: 3,
    stage: 'university',
    topic: '线性代数 · 方程组',
    text: '解线性方程组 $\\begin{cases}x+y=3\\\\2x-y=0\\end{cases}$。',
    encouragement: '用消元法或代入法，写出每步过程。',
    kind: 'problem',
    answerLatex: 'x=1,\\ y=2',
    parts: [
      { step: '列出增广矩阵或直接消元。', points: 3, answer: '由两式相加消 $y$。' },
      { step: '相加得 $3x=3$，即 $x=1$。', points: 3, answer: '$x=1$。' },
      { step: '代回得 $y=2$。', points: 3, answer: '$y=2$。' },
      { step: '检验：$1+2=3$，$2\\times1-2=0$，正确。', points: 1, answer: '解得 $x=1,\\ y=2$。' },
    ],
    solution: [
      '两式相加：$(x+y)+(2x-y)=3+0$，即 $3x=3$。',
      '得 $x=1$。',
      '代入 $x+y=3$，得 $y=2$。',
      '验证成立，解为 $(1,2)$。',
    ],
    tools: ['linalg', 'solver'],
  },

  /* ═══════════════ L4 · 挑战（4 星 · 思维 / 奥数） ═══════════════ */

  {
    id: 'c4-01',
    level: 4,
    stage: 'primary',
    topic: '思维 · 鸡兔同笼',
    text: '笼子里有鸡和兔共 15 个头，40 只脚。问兔子有多少只？（每只鸡 2 只脚，每只兔 4 只脚）',
    encouragement: '先假设全是鸡，看看脚数差了多少，再「换」成兔。',
    kind: 'numeric',
    answer: 5,
    answerLatex: '\\text{兔}=5',
    hint: '假设 15 只全是鸡：$15\\times2=30$ 只脚，差 $40-30=10$ 只，每把一只鸡换成兔多 2 只脚。',
    solution: [
      '假设 15 只全是鸡，脚数 $=15\\times2=30$。',
      '实际 40 只，多出 $40-30=10$ 只脚。',
      '每把一只鸡换成兔，脚数多 $4-2=2$ 只，故兔 $=10\\div2=5$ 只。',
    ],
  },
  {
    id: 'c4-02',
    level: 4,
    stage: 'primary',
    topic: '思维 · 数列求和',
    text: '计算 $1+2+3+\\cdots+100$ 的和。',
    encouragement: '首尾配对，1+100、2+99…… 每对都是 101。',
    kind: 'numeric',
    answer: 5050,
    answerLatex: '1+2+\\cdots+100=\\frac{100\\times101}{2}=5050',
    hint: '共有 50 对，每对和为 101。',
    solution: [
      '首尾配对：$1+100=101$，$2+99=101$，……',
      '共有 $100\\div2=50$ 对。',
      '总和 $=50\\times101=5050$。',
    ],
  },
  {
    id: 'c4-03',
    level: 4,
    stage: 'primary',
    topic: '思维 · 逻辑推理',
    text: '有三个小朋友，甲说「我是第一」，乙说「我不是第二」，丙说「甲不是第一」。已知三人中只有一人说真话，那么谁是第二？请输入 1（甲）、2（乙）或 3（丙）。',
    encouragement: '假设每人分别是第一名，看看谁说真话，逐个验证。',
    kind: 'numeric',
    answer: 2,
    answerLatex: '\\text{乙是第二}',
    hint: '若甲第一，则甲、乙都真，矛盾；若乙第一，则乙真、甲假、丙真；若丙第一，则丙真、甲假、乙真。只有乙第一时甲、丙都假、乙真。等等——这样矛盾。逐个枚举第一名即可。',
    solution: [
      '枚举第一名是谁，逐一检验真话数量。',
      '若甲第一：甲真、乙真（甲非第二成立）、丙假，2 真，不符合。',
      '若乙第一：甲假、乙假、丙真，1 真，符合。',
      '若丙第一：甲假、乙真、丙真，2 真，不符合。',
      '所以乙第一，甲第二、丙第三。故第二是甲，输入 1。',
    ],
  },
  {
    id: 'c4-04',
    level: 4,
    stage: 'middle',
    topic: '数论 · 整除',
    text: '一个三位数能被 9 整除，且各位数字之和为 18。它最小可能是多少？',
    encouragement: '被 9 整除的数，各位数字之和也必须是 9 的倍数。',
    kind: 'numeric',
    answer: 189,
    answerLatex: '\\text{最小三位数}=189',
    hint: '从最小三位数 100 起依次尝试，或先定百位为 1。',
    solution: [
      '三位数最小，百位取 1。',
      '被 9 整除要求数字和是 9 的倍数。',
      '令百位 1、十位 a、个位 b，$1+a+b$ 是 9 的倍数。要尽量小，取 $1+a+b=9$ 或 $18$。',
      '取 $a=8,b=9$（和 18），得 189；检验 $189\\div9=21$，整除。',
    ],
  },
  {
    id: 'c4-05',
    level: 4,
    stage: 'middle',
    topic: '组合 · 排列',
    text: '5 个不同的人站成一排合影，有多少种不同的排法？',
    encouragement: '第 1 个位置有 5 种选择，第 2 个位置剩 4 种…… 连乘起来。',
    kind: 'numeric',
    answer: 120,
    answerLatex: '5!=5\\times4\\times3\\times2\\times1=120',
    hint: '用阶乘：$5!$。',
    solution: [
      '排列数公式：$n!=n\\times(n-1)\\times\\cdots\\times1$。',
      '$5!=5\\times4\\times3\\times2\\times1$。',
      '结果是 $120$。',
    ],
  },
  {
    id: 'c4-06',
    level: 4,
    stage: 'middle',
    topic: '几何 · 面积',
    text: '一个正方形的边长增加 20% 后，面积增加了百分之多少？（填数字，如 44 表示 44%）',
    encouragement: '面积是边长的平方，边长变化会「放大」成平方变化。',
    kind: 'numeric',
    answer: 44,
    answerLatex: '(1.2)^2-1=0.44=44\\%',
    hint: '新边长是原来的 $1.2$ 倍，新面积是原来的 $1.2^2$ 倍。',
    solution: [
      '边长变为原来的 $1.2$ 倍。',
      '面积变为原来的 $1.2^2=1.44$ 倍。',
      '增加 $1.44-1=0.44=44\\%$。',
    ],
  },
  {
    id: 'c4-07',
    level: 4,
    stage: 'high',
    topic: '不等式 · 恒成立',
    text: '若不等式 $x^2-ax+4>0$ 对任意实数 $x$ 恒成立，求实数 $a$ 的取值范围（-4 到 4 的开区间，请填写上限值 4）。',
    encouragement: '二次项系数为正的抛物线要恒大于 0，判别式必须小于 0。',
    kind: 'numeric',
    answer: 4,
    answerLatex: '\\Delta=a^2-16<0 \\Rightarrow -4<a<4',
    hint: '恒大于 0 要求判别式 $\\Delta=a^2-16<0$。',
    solution: [
      '开口向上的抛物线恒大于 0，须与 $x$ 轴无交点。',
      '判别式 $\\Delta=(-a)^2-4\\times1\\times4=a^2-16$。',
      '令 $\\Delta<0$，即 $a^2<16$，得 $-4<a<4$。',
    ],
  },
  {
    id: 'c4-08',
    level: 4,
    stage: 'high',
    topic: '数列 · 递推',
    text: '数列满足 $a_1=1$，$a_{n+1}=2a_n+1$。求 $a_5$。',
    encouragement: '逐项代入递推关系，一步步算到第 5 项。',
    kind: 'numeric',
    answer: 31,
    answerLatex: 'a_2=3,\\ a_3=7,\\ a_4=15,\\ a_5=31',
    hint: '$a_2=2\\times1+1=3$，继续递推。',
    solution: [
      '$a_1=1$。',
      '$a_2=2\\times1+1=3$。',
      '$a_3=2\\times3+1=7$。',
      '$a_4=2\\times7+1=15$。',
      '$a_5=2\\times15+1=31$。',
    ],
  },
  {
    id: 'c4-09',
    level: 4,
    stage: 'university',
    topic: '线性代数 · 矩阵幂',
    text: '设 $A=\\begin{pmatrix}1&0\\\\0&2\\end{pmatrix}$，求 $A^3$ 主对角线元素之和（即 $\\operatorname{tr}(A^3)$）。',
    encouragement: '对角矩阵的幂仍是对角矩阵，每个对角元素分别取幂。',
    kind: 'numeric',
    answer: 9,
    answerLatex: '\\operatorname{tr}(A^3)=1^3+2^3=1+8=9',
    hint: '对角矩阵 $A^k$ 的对角元素是原对角元素的 $k$ 次方。',
    solution: [
      '对角矩阵幂：$A^3=\\begin{pmatrix}1^3&0\\\\0&2^3\\end{pmatrix}$。',
      '$=\\begin{pmatrix}1&0\\\\0&8\\end{pmatrix}$。',
      '迹 $=1+8=9$。',
    ],
    tools: ['linalg'],
  },
  {
    id: 'c4-10',
    level: 4,
    stage: 'university',
    topic: '微积分 · 极限',
    text: '求极限 $\\lim_{x\\to0}\\frac{1-\\cos x}{x^2}$ 的值。',
    encouragement: '用重要极限 $\\lim_{x\\to0}\\frac{\\sin x}{x}=1$ 或泰勒展开。',
    kind: 'numeric',
    answer: 0.5,
    answerLatex: '\\lim_{x\\to0}\\frac{1-\\cos x}{x^2}=\\frac{1}{2}',
    hint: '泰勒展开 $\\cos x=1-\\frac{x^2}{2}+o(x^2)$。',
    solution: [
      '泰勒展开：$\\cos x=1-\\frac{x^2}{2}+o(x^2)$。',
      '代入：$\\frac{1-(1-\\frac{x^2}{2}+o(x^2))}{x^2}=\\frac{\\frac{x^2}{2}+o(x^2)}{x^2}$。',
      '极限为 $\\frac{1}{2}$。',
    ],
    tools: ['solver'],
  },
  {
    id: 'c4-11',
    level: 4,
    stage: 'university',
    topic: '线性代数 · 特征值',
    text: '设 $A=\\begin{pmatrix}3&-1\\\\-1&3\\end{pmatrix}$，求 $A$ 的较大特征值。',
    encouragement: '特征多项式 $\\det(\\lambda I-A)=0$ 的两个根即特征值。',
    kind: 'numeric',
    answer: 4,
    answerLatex: '\\lambda_1=4,\\ \\lambda_2=2',
    hint: '特征多项式 $\\begin{vmatrix}\\lambda-3&1\\\\1&\\lambda-3\\end{vmatrix}=(\\lambda-3)^2-1=0$。',
    solution: [
      '特征多项式：$\\det(\\lambda I-A)=\\begin{vmatrix}\\lambda-3&1\\\\1&\\lambda-3\\end{vmatrix}=(\\lambda-3)^2-1$。',
      '令其为零：$(\\lambda-3)^2-1=0$。',
      '得 $\\lambda-3=\\pm1$，即 $\\lambda=4$ 或 $\\lambda=2$。',
      '较大特征值为 $4$。',
    ],
    tools: ['linalg'],
  },
  {
    id: 'c4-12',
    level: 4,
    stage: 'university',
    topic: '定积分 · 换元技巧',
    text: '计算定积分 $\\int_0^1 \\frac{x}{x^2+1}\\,dx$ 的值（写成小数）。',
    encouragement: '注意分子恰是分母的导数的一半，用换元 $u=x^2+1$。',
    kind: 'numeric',
    answer: 0.34657359027997264,
    answerLatex: '\\int_0^1\\frac{x}{x^2+1}\\,dx=\\frac{1}{2}\\ln 2\\approx0.3466',
    hint: '令 $u=x^2+1$，则 $du=2x\\,dx$。',
    solution: [
      '换元：$u=x^2+1$，$du=2x\\,dx$，即 $x\\,dx=\\frac{1}{2}du$。',
      '$\\int_0^1\\frac{x}{x^2+1}\\,dx=\\frac{1}{2}\\int_1^2\\frac{du}{u}$。',
      '$=\\frac{1}{2}\\ln u\\big|_1^2=\\frac{1}{2}\\ln 2$。',
      '数值约为 $0.3466$。',
    ],
    tools: ['solver'],
  },
  {
    id: 'c4-13',
    level: 4,
    stage: 'university',
    topic: '高数 · 渐近线与极限',
    text: '设 $f(x)=\\frac{2x^3+1}{x^2+1}$，求当 $x\\to\\infty$ 时 $f(x)$ 的斜渐近线斜率（即 $\\lim_{x\\to\\infty}\\frac{f(x)}{x}$ 的值）。',
    encouragement: '斜渐近线 $y=kx+b$，其中 $k=\\lim\\frac{f(x)}{x}$。',
    kind: 'numeric',
    answer: 2,
    answerLatex: 'k=\\lim_{x\\to\\infty}\\frac{f(x)}{x}=2',
    hint: '$\\frac{f(x)}{x}=\\frac{2x^3+1}{x(x^2+1)}$，分子分母同除以 $x^3$。',
    solution: [
      '$k=\\lim_{x\\to\\infty}\\frac{f(x)}{x}=\\lim_{x\\to\\infty}\\frac{2x^3+1}{x(x^2+1)}$。',
      '同除以 $x^3$：$\\lim\\frac{2+\\frac{1}{x^3}}{1+\\frac{1}{x^2}}$。',
      '当 $x\\to\\infty$ 时，$\\frac{1}{x^3}\\to0$、$\\frac{1}{x^2}\\to0$。',
      '故斜渐近线斜率 $k=2$。',
    ],
    tools: ['solver'],
  },
  {
    id: 'c4-14',
    level: 4,
    stage: 'university',
    topic: '考研 · 微分方程',
    text: '求解初值问题 $y\'+y=e^{-x}$，$y(0)=1$。求 $y(1)$ 的值（保留四位小数）。',
    encouragement: '一阶线性微分方程用积分因子 $e^{\\int P\\,dx}=e^x$，两边乘后左边正好是 $(ye^x)\'$。',
    kind: 'numeric',
    answer: 0.7357588823,
    answerLatex: 'y(1)=2e^{-1}\\approx0.7358',
    hint: '积分因子为 $e^x$，$(ye^x)\'=e^x e^{-x}=1$。',
    solution: [
      '方程 $y\'+y=e^{-x}$ 是一阶线性，积分因子 $\\mu=e^{\\int 1\\,dx}=e^x$。',
      '两边乘 $e^x$：$(ye^x)\'=e^x\\cdot e^{-x}=1$。',
      '积分得 $ye^x=x+C$，即 $y=(x+C)e^{-x}$。',
      '代入 $y(0)=1$：$(0+C)=1$，得 $C=1$。',
      '故 $y(1)=(1+1)e^{-1}=2e^{-1}\\approx0.7358$。',
    ],
    tools: ['solver'],
  },
  {
    id: 'c4-15',
    level: 4,
    stage: 'university',
    topic: '考研 · 行列式与逆矩阵',
    text: '设三阶矩阵 $A$ 的特征值为 $1,2,3$，求 $\\det(A^{-1})$ 的值（用分数表示，如 1/6）。',
    encouragement: '特征值之积等于行列式，而 $A^{-1}$ 的特征值是 $A$ 特征值的倒数。',
    kind: 'numeric',
    answer: 1 / 6,
    answerLatex: '\\det(A^{-1})=\\frac{1}{\\det(A)}=\\frac{1}{1\\times2\\times3}=\\frac{1}{6}',
    hint: '$\\det(A)=1\\times2\\times3=6$，且 $\\det(A^{-1})=1/\\det(A)$。',
    solution: [
      '矩阵的行列式等于所有特征值之积：$\\det(A)=1\\times2\\times3=6$。',
      '性质：$\\det(A^{-1})=\\frac{1}{\\det(A)}$。',
      '故 $\\det(A^{-1})=\\frac{1}{6}$。',
    ],
    tools: ['linalg'],
  },
  {
    id: 'c4-16',
    level: 4,
    stage: 'university',
    topic: '考研 · 级数收敛',
    text: '判断级数 $\\sum_{n=1}^{\\infty}\\frac{1}{n^2}$ 是否收敛。若收敛，填收敛到的值（$\\pi^2/6$，保留三位小数）；发散填 0。',
    encouragement: '这是著名的巴塞尔问题，$p=2>1$ 的 $p$-级数收敛。',
    kind: 'numeric',
    answer: 1.64493406685,
    answerLatex: '\\sum_{n=1}^{\\infty}\\frac{1}{n^2}=\\frac{\\pi^2}{6}\\approx1.645',
    hint: '$p$-级数 $\\sum\\frac{1}{n^p}$ 在 $p>1$ 时收敛，且 $\\sum\\frac{1}{n^2}=\\frac{\\pi^2}{6}$。',
    solution: [
      '这是 $p$-级数，其中 $p=2>1$，故级数收敛。',
      '由巴塞尔问题：$\\sum_{n=1}^{\\infty}\\frac{1}{n^2}=\\frac{\\pi^2}{6}$。',
      '数值约为 $1.645$。',
    ],
    tools: ['solver'],
  },
];

/** 按难度取题库。 */
export function questionsByLevel(level: QuestionLevel): Question[] {
  return QUESTION_BANK.filter((q) => q.level === level);
}

/** 推导某题的学段：显式 stage 优先，否则按难度（1 星→小学，2 星→初中，3 星→高中）。 */
export function stageOf(q: Question): QuestionStage {
  if (q.stage) return q.stage;
  if (q.level === 1) return 'primary';
  if (q.level === 2) return 'middle';
  return 'high';
}

/** 按学段取题库。 */
export function questionsByStage(stage: QuestionStage): Question[] {
  return QUESTION_BANK.filter((q) => stageOf(q) === stage);
}

/** 某学段内按难度取题。 */
export function questionsByStageLevel(stage: QuestionStage, level: QuestionLevel): Question[] {
  return questionsByStage(stage).filter((q) => q.level === level);
}

/** 全部题目 id 白名单（用于校验本地存储 / 错题本）。 */
export const VALID_QUESTION_IDS: string[] = QUESTION_BANK.map((q) => q.id);

/** 按 id 取题。 */
export function getQuestion(id: string): Question | undefined {
  return QUESTION_BANK.find((q) => q.id === id);
}

/** 按 id 集合过滤出仍有效的题目。 */
export function filterValidQuestions(ids: unknown[]): string[] {
  return ids.filter((id): id is string => typeof id === 'string' && VALID_QUESTION_IDS.includes(id));
}

/**
 * 校验一个「导入的题目」对象是否结构合法（用于自定义题库导入）。
 * 仅接受符合 Question 最小字段的对象，避免脏数据污染选题与错题本。
 */
export function isQuestion(raw: unknown): raw is Question {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return false;
  if (![1, 2, 3].includes(o.level as number)) return false;
  if (typeof o.text !== 'string' || !o.text.trim()) return false;
  if (!['numeric', 'expression', 'choice'].includes(o.kind as string)) return false;
  if (!Array.isArray(o.solution) || o.solution.length === 0) return false;
  if (o.kind === 'choice') {
    if (!Array.isArray(o.options) || o.options.length < 2) return false;
    if (typeof o.correctIndex !== 'number') return false;
  }
  return true;
}

/**
 * 归一化一个已通过 isQuestion 校验的导入对象为 Question。
 * 补全可选字段的默认值，保证后续渲染（提示 / 答案 / 讲解 / 联动）安全。
 */
export function sanitizeQuestion(raw: Question): Question {
  const o = raw as unknown as Record<string, unknown>;
  return {
    id: String(o.id),
    level: o.level as QuestionLevel,
    stage: STAGES.includes(o.stage as QuestionStage) ? (o.stage as QuestionStage) : undefined,
    topic: typeof o.topic === 'string' && o.topic ? o.topic : '自定义题目',
    text: String(o.text),
    encouragement:
      typeof o.encouragement === 'string' && o.encouragement
        ? String(o.encouragement)
        : '再想想，你一定行的。',
    kind: o.kind as QuestionKind,
    answer: typeof o.answer === 'number' || typeof o.answer === 'string' ? o.answer : undefined,
    options: Array.isArray(o.options) ? (o.options as string[]).map(String) : undefined,
    correctIndex: typeof o.correctIndex === 'number' ? o.correctIndex : undefined,
    answerLatex: typeof o.answerLatex === 'string' ? o.answerLatex : undefined,
    hint: typeof o.hint === 'string' ? o.hint : undefined,
    solution: (o.solution as string[]).map(String),
    plotExpression: typeof o.plotExpression === 'string' ? o.plotExpression : undefined,
    tools: Array.isArray(o.tools)
      ? (o.tools as Array<'linalg' | 'solver' | 'stats'>).filter((t) =>
          ['linalg', 'solver', 'stats'].includes(t),
        )
      : undefined,
  };
}
