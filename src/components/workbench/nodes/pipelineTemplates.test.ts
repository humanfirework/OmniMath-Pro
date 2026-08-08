/**
 * OmniMath Pro — Pipeline template tests (P1-2)
 *
 * 为每个内置模板（`pipelineTemplates.ts`）做两类核对，杜绝「能加载但跑挂」：
 *   1. 连接合法性：节点类型已注册、边两端的端口存在、端口类型兼容。
 *   2. 运行产出   ：非仿真模板经 `executePipeline` 全链无 error；
 *                   仿真模板（ode-feedback-loop / first-order-response）
 *                   经 `runSimulation` 产出有限、非空、单调递增的时序。
 *
 * 说明：`image-vectorization-quickstart` 需要用户上传图片，空图会触发
 * fine-outline 的「输入图像为空」错误，因此该模板只核对连接合法性，不
 * 断言全链运行成功。
 */
import { describe, it, expect } from 'vitest';
import { PIPELINE_TEMPLATES, loadTemplate, type PipelineTemplate } from './pipelineTemplates';
import { executePipeline, canConnect, NODE_TYPES } from './pipelineEngine';
import { runSimulation, isSimulationNode, type SimConfig } from './simulationEngine';
import type { PipelineContext } from './pipelineEngine';

const ctx: PipelineContext = { variables: {} };

/** 仿真模板 id：走 `runSimulation`（而非 `executePipeline`）核对产出。 */
const SIM_TEMPLATE_IDS = new Set([
  'ode-feedback-loop',
  'first-order-response',
  'pid-closed-loop',
  'mass-spring-damper',
  'saturation-integral-windup',
]);

/** 需用户外部输入、空输入即按设计抛错的模板：只核对连接合法性。 */
const EXTERNAL_INPUT_TEMPLATE_IDS = new Set([
  'image-vectorization-quickstart',
  'line-art-extraction',
  'pose-track-animation',
  'video-to-curves-animation',
]);

/**
 * 校验模板的连接合法性，返回问题描述数组（为空表示合法）。
 */
function validateConnections(tpl: PipelineTemplate): string[] {
  const problems: string[] = [];
  const byId = new Map(tpl.nodes.map((n) => [n.id, n]));

  // 1. 节点类型已注册
  for (const n of tpl.nodes) {
    if (!NODE_TYPES[n.type]) problems.push(`[${tpl.id}] 节点 ${n.id} 类型未注册: ${n.type}`);
  }

  // 2. 边两端的节点与端口存在，且类型兼容
  for (const e of tpl.edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from) { problems.push(`[${tpl.id}] 边 ${e.id} 源节点不存在: ${e.from}`); continue; }
    if (!to) { problems.push(`[${tpl.id}] 边 ${e.id} 目标节点不存在: ${e.to}`); continue; }
    const fromDef = NODE_TYPES[from.type];
    const toDef = NODE_TYPES[to.type];
    if (!fromDef || !toDef) continue;
    const outPort = fromDef.outputs.find((p) => p.id === e.fromPort);
    const inPort = toDef.inputs.find((p) => p.id === e.toPort);
    if (!outPort) problems.push(`[${tpl.id}] 边 ${e.id} 节点 ${e.from} 无输出端口 ${e.fromPort}`);
    if (!inPort) problems.push(`[${tpl.id}] 边 ${e.id} 节点 ${e.to} 无输入端口 ${e.toPort}`);
    if (outPort && inPort && !canConnect(outPort.type, inPort.type)) {
      problems.push(`[${tpl.id}] 边 ${e.id} 类型不兼容: ${outPort.type} → ${inPort.type}`);
    }
  }

  return problems;
}

describe('pipelineTemplates (P1-2)', () => {
  it('每个模板都能被 loadTemplate 加载（深拷贝）', () => {
    for (const tpl of PIPELINE_TEMPLATES) {
      const loaded = loadTemplate(tpl.id);
      expect(loaded, `模板 ${tpl.id} 应可加载`).not.toBeNull();
      expect(loaded!.nodes).toHaveLength(tpl.nodes.length);
      expect(loaded!.edges).toHaveLength(tpl.edges.length);
      // 深拷贝：修改加载结果不影响共享模板
      const origX = tpl.nodes[0].position.x;
      loaded!.nodes[0].position.x += 999;
      expect(tpl.nodes[0].position.x).toBe(origX);
    }
  });

  it('所有模板连接合法：节点类型注册、端口存在、类型兼容', () => {
    for (const tpl of PIPELINE_TEMPLATES) {
      const problems = validateConnections(tpl);
      expect(problems, `模板 ${tpl.id} 连接校验失败`).toEqual([]);
    }
  });

  it('非仿真模板经 executePipeline 全链运行无 error', async () => {
    const runnable = PIPELINE_TEMPLATES.filter(
      (t) => !SIM_TEMPLATE_IDS.has(t.id) && !EXTERNAL_INPUT_TEMPLATE_IDS.has(t.id),
    );
    expect(runnable.length).toBeGreaterThan(0);
    for (const tpl of runnable) {
      const { nodes, edges } = loadTemplate(tpl.id)!;
      const out = await executePipeline(nodes, edges, ctx);
      const errored = out.filter((n) => n.error !== undefined);
      expect(
        errored,
        `模板 ${tpl.id} 运行出现错误: ${errored.map((n) => `${n.id}:${n.error}`).join('; ')}`,
      ).toEqual([]);
    }
  });

  it('仿真模板经 runSimulation 产出有限、有序的时序', () => {
    const simTpls = PIPELINE_TEMPLATES.filter((t) => SIM_TEMPLATE_IDS.has(t.id));
    expect(simTpls.length).toBeGreaterThan(0);
    const config: SimConfig = {
      t0: 0,
      tEnd: 10,
      dt: 0.1,
      method: 'euler',
      relTol: 1e-6,
      absTol: 1e-9,
      maxAlgebraicIter: 200,
    };
    for (const tpl of simTpls) {
      const { nodes, edges } = loadTemplate(tpl.id)!;
      const { series, t } = runSimulation(nodes, edges, config);
      expect(nodes.some(isSimulationNode)).toBe(true);
      expect(t.length).toBeGreaterThan(0);
      // 时间轴单调递增
      for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
      // sim-scope 产物有限且非空
      for (const n of nodes) {
        if (n.type === 'sim-scope') {
          const samples = series[n.id];
          expect(samples, `模板 ${tpl.id} scope ${n.id} 应有采样`).toBeDefined();
          expect(samples!.length).toBeGreaterThan(0);
          expect(samples!.every((v) => Number.isFinite(v))).toBe(true);
        }
      }
    }
  });
});