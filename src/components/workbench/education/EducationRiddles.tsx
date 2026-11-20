'use client';

/**
 * OmniMath Pro — 学习陪伴 · 数学未解之谜
 *
 * 面向学生的「至今未解之谜」板块：精选 12 个影响深远、至今无人完全解决的
 * 世界数学难题。列表呈现「一句话概述」，点击任意一题可进入完整详情：
 * 问题概述、历史与背景、当前进展、相关人物、权威论文与资料，并支持一键
 * 「让 AI 助教深入讲解」。
 *
 * 详情底部附一句随机「勇者鼓励」——敢于凝视一个无人能解的难题，本身就是
 * 一种勇气的证明。呼应 2026 年王虹、邓煜同届斩获菲尔兹奖的星辰大海。
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ExternalLink,
  Puzzle,
  Sparkles,
  GraduationCap,
  History,
  Activity,
  Users,
  BookOpen,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type RiddleLink = { label: string; url: string };
type StatusTone = 'millennium' | 'open' | 'debate' | 'independent';

type Riddle = {
  name: string;
  field: string;
  status: string;
  tone: StatusTone;
  summary: string;
  overview: string;
  history: string;
  progress: string;
  figures: string;
  importance: string;
  papers: RiddleLink[];
};

const TONE_STYLE: Record<StatusTone, string> = {
  millennium: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  open: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  debate: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  independent: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
};

const TONE_DOT: Record<StatusTone, string> = {
  millennium: 'bg-emerald-500',
  open: 'bg-amber-500',
  debate: 'bg-rose-500',
  independent: 'bg-sky-500',
};

const TONE_LABEL: Record<StatusTone, string> = {
  millennium: '千禧年问题',
  open: '未解',
  debate: '争议',
  independent: '不可判定',
};

/** 点击进入详情后，底部的随机「勇者鼓励」彩蛋。 */
const ENCOURAGE = [
  '敢于凝视一个无人能解的难题，本身就是一种勇气的证明。',
  '数学史上每一次突破，都始于某个少年对「未解之谜」的好奇。',
  '你愿意停下来、读懂它，这已经很了不起了。',
  '真正的难题从不害怕被理解——它们只害怕被放弃。',
  '仰望星空的勇气，和脚踏实地的推导，同样值得被称赞。',
  '今天你多读懂一行，世界就多一种被理解的可能。',
  '所有伟大发现之前，都是漫长的、无人知晓的坚持。',
  '你正站在无数前人曾驻足的地方——而他们之中，有人继续前行了。',
];

const RIDDLES: Riddle[] = [
  {
    name: '黎曼猜想',
    field: '数论 · 复分析',
    status: '未解 · 千禧年',
    tone: 'millennium',
    summary: '黎曼ζ函数的所有「非平凡零点」都落在实部为 1/2 的那条直线上。看似抽象，却深藏着素数分布的规律，被誉为数学的「圣杯」。',
    overview:
      '黎曼猜想关注黎曼ζ函数 ζ(s) 的「非平凡零点」。1737 年欧拉率先发现了 ζ 函数与素数之间的乘积关系，而 1859 年黎曼在论文中提出：ζ(s) 的所有非平凡零点，其实部都等于 1/2。若该猜想成立，素数在整数中的分布规律就能被精确刻画——这也是它被誉为「圣杯」的原因。',
    history:
      '1740 年代，欧拉揭示 ζ 函数与素数的恒等式；1859 年，黎曼正式提出该猜想；此后它成为解析数论乃至整个数学最核心、最持久的未解难题之一。',
    progress:
      '迄今已借助计算机核验了超过十万亿个零点，它们全部落在临界线上；1986 年数学家证明临界线上有无限多个零点；但「全部」落在线上仍未获证明。它位列克雷数学研究所七大千禧年问题，悬赏一百万美元。',
    figures: '黎曼（提出）、欧拉（前奏）、哈代与利特尔伍德（临界线上零点无穷多）、阿蒂亚（2018 曾宣称证明但未被学界认可）',
    importance:
      '它关涉素数分布的核心规律，其成立与否将连带影响大量数论定理；许多「假设黎曼猜想成立」的结论早已被广泛应用。',
    papers: [
      { label: '克雷数学研究所', url: 'https://www.claymath.org/millennium/riemann-hypothesis/' },
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/黎曼猜想' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Riemann_hypothesis' },
    ],
  },
  {
    name: 'P vs NP',
    field: '理论计算机',
    status: '未解 · 千禧年',
    tone: 'millennium',
    summary: '如果验证一个答案很容易，求解是否也容易？P 是否等于 NP，关乎密码学与整个计算机世界的根基。',
    overview:
      'P 是能在多项式时间内求解的问题类，NP 是能在多项式时间内验证解的问题类。P 是否等于 NP，即「能快速验证的，是否也一定能快速求解」。例如旅行商找最短路线很难，但验证一条路线是否最短却很快；若 P=NP，现有基于「分解大数很困难」的加密体系将彻底崩塌。',
    history:
      '1971 年，库克提出 NP 完全概念；同年库克与莱文确立了 NP 完全问题的代表性，由此「P vs NP」成为计算机科学最著名的问题。',
    progress:
      '这一问题悬置数十年未决。绝大多数理论计算机学家相信 P≠NP，但至今无人能给出证明。它同样是克雷千禧年问题之一。',
    figures: '库克（Cook）、莱文（Levin）、卡尔普（Karp）',
    importance: '它关乎密码学、算法设计与运筹优化的根基；若 P=NP，整个计算世界将被彻底改写。',
    papers: [
      { label: '克雷数学研究所', url: 'https://www.claymath.org/millennium/p-vs-np/' },
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/P%E5%AF%B9NP%E9%97%AE%E9%A2%98' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/P_versus_NP_problem' },
    ],
  },
  {
    name: '纳维-斯托克斯方程',
    field: '偏微分方程 · 流体力学',
    status: '未解 · 千禧年',
    tone: 'millennium',
    summary: '描述水和空气流动的方程，其解能否永远存在且光滑、唯一？湍流之谜至今没有严格证明。',
    overview:
      '纳维-斯托克斯方程描述粘性不可压缩流体的运动。千禧年问题的表述是：给定光滑初值，方程是否始终存在光滑（无限可微）且全局有界的解？中心的「湍流为什么会发生」这一基本问题，恰恰隐藏在解的奇异点之中。',
    history: '19 世纪由纳维与斯托克斯建立；忽略粘性的特例即著名的欧拉方程。',
    progress:
      '在二维情形，解的光滑性已被证明；但在三维，仅在「小初值」或「短时间」等特殊情形有部分结果，全局光滑性至今悬而未决。',
    figures: '纳维、斯托克斯、欧拉',
    importance: '它是流体力学、气象、航空与工程的核心方程；其解的存在性直接影响人类对湍流本质的理解。',
    papers: [
      { label: '克雷数学研究所', url: 'https://www.claymath.org/millennium/navier-stokes-equation/' },
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/%E7%BA%B3%E7%BB%B4%E5%B0%94-%E6%96%AF%E6%89%98%E5%85%8B%E6%96%AF%E6%96%B9%E7%A8%8B' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Navier%E2%80%93Stokes_existence_and_smoothness' },
    ],
  },
  {
    name: '霍奇猜想',
    field: '代数几何 · 拓扑',
    status: '未解 · 千禧年',
    tone: 'millennium',
    summary: '复杂几何形状上的「洞」，能否完全用代数方程来刻画？在低维已知，高维仍是难题。',
    overview:
      '霍奇猜想问：对于光滑的射影代数簇，其「霍奇类」（一种上同调类）是否总能由代数子簇的类线性组合来表示。简言之，几何对象的内部结构能否由「代数方程」完全刻画。',
    history: '1950 年由霍奇提出，是代数几何与微分几何交汇处的基本问题。',
    progress: '在一些低维情形（如余维数为 1 的情形）已获证明；但在高维的一般情形，仍是未解难题。',
    figures: '霍奇（Hodge）',
    importance: '它是沟通几何与代数的桥梁，对代数几何、复几何与数学物理都有深远影响。',
    papers: [
      { label: '克雷数学研究所', url: 'https://www.claymath.org/millennium/hodge-conjecture/' },
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/霍奇猜想' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Hodge_conjecture' },
    ],
  },
  {
    name: '杨-米尔斯与质量间隙',
    field: '数学物理',
    status: '未解 · 千禧年',
    tone: 'millennium',
    summary: '夸克这样的粒子为何会有质量？量子规范场理论预言的「质量间隙」，数学上至今无法严格证明。',
    overview:
      '杨-米尔斯理论描述规范场（如强相互作用的夸克与胶子）。千禧年问题要求严格证明：在四维时空中，满足某些条件的杨-米尔斯方程存在具有「质量间隙」的解——即对应的粒子有最小的正质量。',
    history: '1954 年由杨振宁与米尔斯提出，是现代粒子物理标准模型的数学基础之一。',
    progress: '该理论在物理上获得大量实验支持，但「质量间隙的存在性」在数学上仍缺乏严格的证明。',
    figures: '杨振宁、米尔斯',
    importance: '它连接粒子物理与数学；质量间隙的存在性至今无法被严格证明，是理论物理与数学交汇处的关键缺口。',
    papers: [
      { label: '克雷数学研究所', url: 'https://www.claymath.org/millennium/yang-mills-the-maths-gap/' },
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/杨-米尔斯理论' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Yang%E2%80%93Mills_existence_and_mass_gap' },
    ],
  },
  {
    name: '贝赫和斯维讷通-戴尔猜想',
    field: '数论 · 椭圆曲线',
    status: '未解 · 千禧年',
    tone: 'millennium',
    summary: '椭圆曲线上有理点的数量（秩），能否用 L 函数在 1 处的取值来判断？它与费马大定理、密码学相连。',
    overview:
      '椭圆曲线上的有理数点构成一个群。BSD 猜想断言：椭圆曲线的 Mordell–Weil 秩（即生成元个数）等于其 L 函数在 s=1 处零点的阶。尤其当 L(1)≠0 时，曲线只有有限多个有理点。',
    history: '1960 年代由贝赫与斯维讷通-戴尔提出。',
    progress:
      '在部分情形（如 L(1)≠0 时）已有突破性结果，但一般情形仍未证明。它位列克雷千禧年问题，与费马大定理的证明技术同源。',
    figures: '贝赫、斯维讷通-戴尔',
    importance: '它是数论与分析交汇的枢纽，与椭圆曲线密码学、费马大定理的证明都有深刻关联。',
    papers: [
      { label: '克雷数学研究所', url: 'https://www.claymath.org/millennium/birch-and-swinnerton-dyer-conjecture/' },
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/%E8%B4%9D%E8%B5%AB%E5%92%8C%E6%96%AF%E7%BB%B4%E7%BA%B3%E9%80%9A-%E6%88%B4%E5%B0%94%E7%8C%9C%E6%83%B3' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Birch_and_Swinnerton-Dyer_conjecture' },
    ],
  },
  {
    name: '哥德巴赫猜想',
    field: '数论',
    status: '未解',
    tone: 'open',
    summary: '“任一大于 2 的偶数都能写成两个质数之和”，表达最简单，却难倒数学家 280 多年。',
    overview:
      '任一大于 2 的偶数都可以分解为两个质数之和，例如 4=2+2、8=3+5。它由哥德巴赫于 1742 年致信欧拉时提出，是数论中表达最朴素、却最难攻克的猜想之一。',
    history:
      '1742 年哥德巴赫提出；1966 年，中国数学家陈景润证明了「1+2」——任一充分大的偶数可表示为一个质数与两个质数之积的和，即著名的陈氏定理，是迄今最接近原猜想的成果。',
    progress: '陈氏定理「1+2」是这一方向上的顶峰；而「1+1」（即原猜想本身）至今仍未获证明。',
    figures: '哥德巴赫、欧拉、华罗庚、王元、陈景润',
    importance:
      '它是素数结构的代表性难题；中国数学家华罗庚、王元、陈景润等在此领域贡献卓著，是国人引以为傲的数论传统。',
    papers: [
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/哥德巴赫猜想' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Goldbach%27s_conjecture' },
    ],
  },
  {
    name: '孪生素数猜想',
    field: '数论',
    status: '未解',
    tone: 'open',
    summary: '像 (11,13)、(17,19) 这样相差 2 的质数对，是否无穷多？张益唐 2013 年迈出关键一步。',
    overview:
      '相差为 2 的质数对（如 11 与 13）称为孪生素数，猜想它们有无穷多对。这一看似简单的问题，牵动素数分布与加性数论的核心。',
    history:
      '2013 年，张益唐首次证明：存在无穷多对相差不超过 7000 万的质数对；随后这一界被 Polymath 项目一路优化到 246。',
    progress:
      '2013 年张益唐实现历史性突破，之后被大幅优化；但一步步逼近「相差恰好为 2」的最终目标，至今仍是悬案。',
    figures: '张益唐、詹姆斯·梅纳德（James Maynard）、陶哲轩（Polymath 项目）',
    importance:
      '它是素数分布与加性数论的核心问题；张益唐的突破一夜成名，也激励了无数青年数学家相信「平凡人也可能有大发现」。',
    papers: [
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/%E5%AD%AA%E7%94%9F%E7%B4%A0%E6%95%B0%E7%8C%9C%E6%83%B3' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Twin_prime' },
      { label: '张益唐论文 arXiv', url: 'https://arxiv.org/abs/1311.4600' },
    ],
  },
  {
    name: '考拉兹猜想（3n+1）',
    field: '数论 · 动态系统',
    status: '未解',
    tone: 'open',
    summary: '任意正整数：偶数除 2、奇数乘 3 加 1，反复操作最终总会到 1 吗？被称为「最简单却无法解决的问题」。',
    overview:
      '对任意正整数 n，若为偶数则取 n/2，若为奇数则取 3n+1，反复迭代——是否最终总会到达 1？人类已核验到极大的数仍未找到反例，却无人能证明它永远成立。',
    history: '1930 年代由洛萨·考拉兹提出；因「3n+1 问题」别名流传，被称作最简单的无法解决的问题。',
    progress:
      '计算机穷举到 2^68 以上的范围均无反例；2019 年陶哲轩就特定的一类情形给出部分结果，但一般情况仍未解决。',
    figures: '洛萨·考拉兹、陶哲轩（2019 部分结果）',
    importance: '它是混沌与动态系统的代表，问题表述极简却连接着随机性与动力系统的深层结构。',
    papers: [
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/考拉兹猜想' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Collatz_conjecture' },
    ],
  },
  {
    name: 'ABC 猜想',
    field: '数论',
    status: '争议',
    tone: 'debate',
    summary: '关于互素整数 a+b=c 的质因子下界。望月新一宣称证明，但证明艰深、学界争议巨大。',
    overview:
      '对互素的整数 a、b、c 且 a+b=c，ABC 猜想希望建立其质因子大小的统一下界。若成立，可推出费马大定理、阿贝尔方程等大量重要结论。',
    history: '1985 年由马瑟与奥斯特勒提出。',
    progress:
      '2012 年望月新一宣称用其「宇宙际泰希米勒理论（IUT）」完成证明；2020 年相关论文发表于 PRIMS 特刊，但 Scholze 与 Stix 认为其中存在致命缺陷，学界至今仍有巨大争议。',
    figures: '马瑟、奥斯特勒、望月新一、Scholze、Stix',
    importance: '它是一把「大锤」，能一举推出许多著名数论定理，因此被视为数论的「圣杯级」猜想。',
    papers: [
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/ABC%E7%8C%9C%E6%83%B3' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Abc_conjecture' },
    ],
  },
  {
    name: '奇完全数是否存在',
    field: '数论',
    status: '未解',
    tone: 'open',
    summary: '完全数是等于自身真因子之和的数。偶完全数都对应梅森素数，但「奇数完全数」是否存在至今无解。',
    overview:
      '完全数是「恰好等于其真因子之和」的数，如 6=1+2+3、28=1+2+4+7+14。已知偶完全数都与梅森素数一一对应，但「是否存在奇数完全数」这个朴素问题，至今没有答案。',
    history: '欧几里得与欧拉给出了偶完全数与梅森素数的对应关系；奇完全数的存在性问题悬置了数百年。',
    progress:
      '数学家已证明：奇完全数若存在，则必须至少有 9 个不同的质因子、且大于 10^1500 等大量必要条件；但它的存在性至今仍未确定。',
    figures: '欧几里得、欧拉',
    importance: '这是一个古老而朴素的问题；为逼近它而发展出的「必要条件」研究，反过来推动了因子结构理论的进展。',
    papers: [
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/完全数' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Perfect_number' },
    ],
  },
  {
    name: '连续统假设',
    field: '集合论',
    status: '不可判定',
    tone: 'independent',
    summary: '是否存在比整数多、比实数少的无穷大？它被证明「独立于公理」——既不能证明，也不能推翻。',
    overview:
      '是否存在一个无穷基数严格介于可数无穷（ℵ₀）与实数集之间？哥德尔（1940）证明它不能被 ZFC 公理系统证明为假，科恩（1963）又证明它也不能被证明为真——即它独立于 ZFC。',
    history: '1878 年由康托尔提出；1900 年被希尔伯特列为第 1 问题。',
    progress:
      '哥德尔与科恩证明了它的独立性（不可判定）。因此「是否成立」取决于选择哪一套公理体系，两种选择都能自洽。',
    figures: '康托尔、希尔伯特、哥德尔、科恩',
    importance:
      '它奠定了集合论中「独立」这一核心概念，深刻影响了数理逻辑与整个数学基础，打破了「数学命题非真即假」的朴素观念。',
    papers: [
      { label: '中文维基', url: 'https://zh.wikipedia.org/wiki/连续统假设' },
      { label: '英文维基（含参考文献）', url: 'https://en.wikipedia.org/wiki/Continuum_hypothesis' },
    ],
  },
];

function Section({ icon: Icon, title, children }: { icon: typeof History; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-background/40 p-3.5">
      <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        <Icon className="size-3.5 text-primary" />
        {title}
      </h4>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{children}</p>
    </section>
  );
}

export function EducationRiddles({ onAskAI }: { onAskAI?: (prompt: string) => void }) {
  const [selected, setSelected] = useState<Riddle | null>(null);
  const [quote, setQuote] = useState(ENCOURAGE[0]);

  const open = (r: Riddle) => {
    setQuote(ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)]);
    setSelected(r);
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* 头部简介 */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-sky-500/10 p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/15">
            <Puzzle className="size-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
              数学的「至今未解之谜」
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              下面这些世界级难题，有些悬置了上百年。点击任意一题可进入详情，查看它的来龙去脉与权威资料。
              2026 年，中国的王虹、邓煜同届斩获菲尔兹奖——他们正是攻克了挂谷猜想、希尔伯特第六问题这样的世界难题。也许，
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                下一个解开其中某一题的人，就是你。
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[10.5px] text-muted-foreground">
        <span className="mr-1">状态：</span>
        {(Object.keys(TONE_STYLE) as StatusTone[]).map((t) => (
          <span
            key={t}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
              TONE_STYLE[t],
            )}
          >
            <span className={cn('size-1.5 rounded-full', TONE_DOT[t])} />
            {TONE_LABEL[t]}
          </span>
        ))}
      </div>

      {/* 未解之谜卡片列表 */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {RIDDLES.map((r, i) => (
          <motion.button
            key={r.name}
            type="button"
            onClick={() => open(r)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.25 }}
            className="group relative flex flex-col rounded-2xl border border-border bg-card/50 p-4 text-left transition-all hover:border-primary/40 hover:bg-card hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] font-bold tracking-tight text-foreground">
                    {r.name}
                  </span>
                  <span className="shrink-0 text-[9.5px] text-muted-foreground/70">{r.field}</span>
                </div>
              </div>
              <span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold',
                  TONE_STYLE[r.tone],
                )}
              >
                <span className={cn('size-1.5 rounded-full', TONE_DOT[r.tone])} />
                {r.status}
              </span>
            </div>

            <p className="mt-2.5 flex-1 text-[12px] leading-relaxed text-muted-foreground">
              {r.summary}
            </p>

            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-primary opacity-80 transition-opacity group-hover:opacity-100">
                <BookOpen className="size-3" />
                查看详情
              </span>
              <span className="text-[10px] text-muted-foreground/60 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </div>
          </motion.button>
        ))}
      </div>

      {/* 底部激励 */}
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-dashed border-primary/25 bg-primary/5 px-4 py-3 text-[12px] text-muted-foreground">
        <Sparkles className="size-3.5 shrink-0 text-primary" />
        <span>
          数学里还有很多「百万美元级」的开放难题。保持好奇、持续学习，这些难题的前沿就有你的一席之地。
        </span>
      </div>

      {/* ── 详情弹窗 ─────────────────────────────────────────── */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl gap-0 p-0">
          {selected && (
            <>
              <DialogHeader className="shrink-0 border-b border-border/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <DialogTitle className="text-[17px] font-bold tracking-tight text-foreground">
                        {selected.name}
                      </DialogTitle>
                      <span className="text-[10px] text-muted-foreground/70">{selected.field}</span>
                    </div>
                    <DialogDescription className="mt-1 text-[11px] text-muted-foreground">
                      {selected.status} · 数学至今未解的世界难题
                    </DialogDescription>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                      TONE_STYLE[selected.tone],
                    )}
                  >
                    <span className={cn('size-1.5 rounded-full', TONE_DOT[selected.tone])} />
                    {selected.status}
                  </span>
                </div>
              </DialogHeader>

              <ScrollArea className="max-h-[62vh] min-h-0">
                <div className="space-y-3 p-5">
                  <Section icon={BookOpen} title="问题概述">
                    {selected.overview}
                  </Section>
                  <Section icon={History} title="历史与背景">
                    {selected.history}
                  </Section>
                  <Section icon={Activity} title="当前进展">
                    {selected.progress}
                  </Section>
                  <Section icon={Users} title="相关人物">
                    {selected.figures}
                  </Section>
                  <Section icon={BookOpen} title="为何重要">
                    {selected.importance}
                  </Section>

                  {/* 权威论文与资料 */}
                  <section className="rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                    <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                      <BookOpen className="size-3.5 text-primary" />
                      权威论文与资料
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selected.papers.map((l) => (
                        <a
                          key={l.url + l.label}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/70 px-2 py-1 text-[10.5px] font-medium text-primary transition-colors hover:bg-primary/10 hover:underline"
                        >
                          {l.label}
                          <ExternalLink className="size-2.5 opacity-60" />
                        </a>
                      ))}
                    </div>
                  </section>

                  {/* 勇者鼓励彩蛋 */}
                  <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3.5">
                    <p className="text-[11.5px] leading-relaxed text-foreground/85">
                      <span className="mr-1 font-semibold text-amber-600 dark:text-amber-400">致勇者：</span>
                      {quote}
                    </p>
                  </div>
                </div>
              </ScrollArea>

              <div className="shrink-0 flex items-center gap-2 border-t border-border/60 bg-background/40 p-3">
                <button
                  type="button"
                  onClick={() => {
                    const prompt = `请深入讲解「${selected.name}」这个至今未解的数学难题：${selected.overview} 请分点、用浅显的语言讲清楚它到底是什么、为什么重要、目前做到哪一步，鼓励感兴趣的学习者，并给出可以继续探索的方向。`;
                    setSelected(null);
                    onAskAI?.(prompt);
                  }}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 text-[12px] font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  <GraduationCap className="size-3.5" />
                  让 AI 助教深入讲解
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-muted/40 px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  <X className="size-3.5" />
                  关闭
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}