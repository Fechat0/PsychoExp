// Supabase Edge Function: generate-advice
// Deploy with: supabase functions deploy generate-advice --no-verify-jwt
// Optional secrets: LLM_API_KEY, LLM_API_URL, LLM_MODEL.
// Trading decisions and target positions are deterministic across treatment groups.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

type GroupType = "human" | "ai";
type Recommendation = "BUY" | "HOLD";

type ScriptEntry = {
  recommendation: Recommendation;
  target_position_pct: number;
  human: string;
  ai: string;
};

const SCRIPT: ScriptEntry[] = [
  { recommendation: "BUY", target_position_pct: 20, human: "从日线级别看，价格仍处于温和抬升阶段，建议建立小比例试探性仓位，目标仓位约为总资产的 20%。", ai: "【趋势信号】温和上行；【策略动作】BUY；【目标仓位】20%；【风险提示】保持初始仓位，避免过早集中。" },
  { recommendation: "HOLD", target_position_pct: 20, human: "当前价格围绕短期趋势小幅波动，暂未出现需要调整仓位的明确信号。建议维持现有配置，目标仓位约 20%。", ai: "【趋势信号】区间震荡；【策略动作】HOLD；【目标仓位】20%；【风险提示】暂不扩大敞口。" },
  { recommendation: "HOLD", target_position_pct: 20, human: "日线结构暂以整理为主，继续观察价格能否站稳短期均线。建议保持仓位不变，目标仓位约 20%。", ai: "【趋势信号】整理；【策略动作】HOLD；【目标仓位】20%；【风险提示】等待方向确认。" },
  { recommendation: "BUY", target_position_pct: 30, human: "短期价格重心有所上移，趋势信号较前一交易日改善。可适度增加配置，目标仓位调整至约 30%。", ai: "【趋势信号】动量温和改善；【策略动作】BUY；【目标仓位】30%；【风险提示】分批执行。" },
  { recommendation: "HOLD", target_position_pct: 30, human: "价格进入短暂盘整，当前配置与趋势判断基本匹配。建议暂时持有，目标仓位维持在 30% 左右。", ai: "【趋势信号】高位盘整；【策略动作】HOLD；【目标仓位】30%；【风险提示】维持当前风险敞口。" },
  { recommendation: "BUY", target_position_pct: 40, human: "近期价格重心持续抬升，趋势指标偏积极。可在控制风险的前提下小幅加仓，目标仓位约 40%。", ai: "【趋势信号】动量转强；【策略动作】BUY；【目标仓位】40%；【风险提示】按计划分批增配。" },
  { recommendation: "BUY", target_position_pct: 70, human: "近期市场消息与价格走势明显转强，短期均线呈多头排列。建议积极提高配置比例，目标仓位约 70%。", ai: "【趋势信号】动量、波动率同步转强；【策略动作】BUY；【目标仓位】70%；【风险提示】建议提高仓位至目标区间。" },
  { recommendation: "BUY", target_position_pct: 90, human: "利好情绪仍在扩散，价格呈现加速上行特征。建议进一步提高持仓比例，目标仓位约 90%，同时关注后续波动。", ai: "【趋势信号】价格加速、情绪扩张；【策略动作】BUY；【目标仓位】90%；【风险提示】建议接近高仓位运行。" },
];

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function offlineResponse(group_type: GroupType, day_index: number) {
  return jsonResponse(200, {
    ok: true,
    group_type,
    day_index,
    recommendation: "OFFLINE",
    target_position_pct: null,
    advice_text: "系统维护中 / 顾问暂时失联。该交易日无法获取顾问建议，请依据现有信息独立决策。",
    source: "offline",
    offline: true,
  });
}

async function polishRationaleOnly(apiKey: string, group: GroupType, day: number, fixedText: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const url = Deno.env.get("LLM_API_URL") ?? "https://api.deepseek.com/chat/completions";
    const model = Deno.env.get("LLM_MODEL") ?? "deepseek-chat";
    const style = group === "human" ? "券商高级分析师语气，专业、克制、自然。" : "AI 数据面板语气，极度理性、简洁、结构化。";
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 120,
        messages: [
          { role: "system", content: "你只负责润色市场观察理由。不得修改、暗示或新增 BUY/HOLD/SELL 动作，不得改变任何仓位比例，不得输出交易结论。只输出一条不超过 45 个汉字的中性市场观察，不得编造未提供的数据。" },
          { role: "user", content: "实验交易日：" + day + "。表达风格：" + style + "请将以下固定观察语句润色为指定风格：" + fixedText },
        ],
      }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const clean = content.trim().slice(0, 240);
    if (!clean || /BUY|SELL|HOLD|买入|卖出|持有|加仓|减仓|仓位|\d+\s*%/i.test(clean)) return null;
    return clean;
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" });

  try {
    const body = await request.json();
    const group = body?.group_type as GroupType;
    const day = Number(body?.day_index);
    if (group !== "human" && group !== "ai") {
      return jsonResponse(400, { ok: false, error: "group_type must be human or ai" });
    }
    if (!Number.isInteger(day) || day < 1 || day > 10) {
      return jsonResponse(400, { ok: false, error: "day_index must be an integer from 1 to 10" });
    }
    if (day >= 9) return offlineResponse(group, day);

    const entry = SCRIPT[day - 1];
    let adviceText = group === "human" ? entry.human : entry.ai;
    let source = "script";
    const apiKey = Deno.env.get("LLM_API_KEY");
    if (apiKey) {
      const polished = await polishRationaleOnly(apiKey, group, day, adviceText);
      if (polished) {
        const fixedConclusion = "【固定建议结论】" + entry.recommendation + "；【目标仓位】" + entry.target_position_pct + "%。";
        adviceText = polished + "\n" + fixedConclusion;
        source = "script+llm-style";
      }
    }

    return jsonResponse(200, {
      ok: true,
      group_type: group,
      day_index: day,
      recommendation: entry.recommendation,
      target_position_pct: entry.target_position_pct,
      advice_text: adviceText,
      source,
      offline: false,
      stock_state_received: body?.stock_state ?? null,
    });
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid request body",
    });
  }
});