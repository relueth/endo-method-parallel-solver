import React, { useState } from "react";
import { EndoResult } from "../types";
import { Calculator, Sparkles, HelpCircle, ArrowRight, Check, Zap } from "lucide-react";

export const EndoExplorer: React.FC = () => {
  const [nInput, setNInput] = useState<string>("12");
  const [result, setResult] = useState<EndoResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const presets = [4, 12, 24, 72, 100, 256, 1000];

  const handleCalculate = async (val?: number) => {
    const targetN = val !== undefined ? val : parseInt(nInput, 10);
    if (isNaN(targetN) || targetN < 1) {
      setError("1以上の整数を入力してください。");
      return;
    }
    setError(null);
    setLoading(true);
    setNInput(targetN.toString());

    try {
      const res = await fetch("/api/endo/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: targetN }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "計算に失敗しました");
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <Calculator className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
              Endo_method φ⁻¹(n) 単体検証ツール
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            オイラー関数の方程式 φ(x) = n の完全解集合を Endo法 (乗法的分割 $M(n)$ と $\theta(n)$ の直和) で高速求解
          </p>
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 text-[11px] mr-1">プリセット:</span>
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => handleCalculate(p)}
              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-mono text-slate-700 transition-colors"
            >
              n={p}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1 flex items-center space-x-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2">
          <span className="font-serif font-bold text-slate-700 text-sm italic">φ(x) =</span>
          <input
            type="number"
            min={1}
            value={nInput}
            onChange={(e) => setNInput(e.target.value)}
            placeholder="正の整数 n を入力 (例: 12)"
            className="flex-1 bg-transparent font-mono text-slate-900 font-semibold text-sm focus:outline-hidden"
          />
        </div>

        <button
          onClick={() => handleCalculate()}
          disabled={loading}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-cyan-600 text-white font-semibold text-xs hover:bg-cyan-700 shadow-xs transition-colors disabled:opacity-50"
        >
          <Zap className="w-4 h-4 mr-1.5 fill-current" />
          {loading ? "計算中 (Endo_method)..." : "φ⁻¹(n) を計算する"}
        </button>
      </div>

      {error && (
        <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          {error}
        </div>
      )}

      {/* Result Display */}
      {result && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <span className="text-xs text-slate-500 font-medium">計算対象:</span>
              <span className="ml-2 font-mono font-bold text-base text-slate-900">
                n = {result.n}
              </span>
            </div>
            <div className="flex items-center space-x-4 text-xs font-mono">
              <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md font-bold">
                解の総数: {result.count} 個
              </span>
              <span className="text-slate-500">
                計算時間: <strong className="text-slate-800">{result.duration_ms} ms</strong>
              </span>
            </div>
          </div>

          {/* Solution Array */}
          <div>
            <h4 className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center">
              <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              解集合 φ⁻¹({result.n}) = &#123; x | φ(x) = {result.n} &#125;
            </h4>
            {result.solutions.length === 0 ? (
              <div className="p-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-500 italic">
                解は存在しません (φ(x) = {result.n} となる正整数 x はなし)
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-white border border-slate-200 max-h-40 overflow-y-auto font-mono text-xs text-slate-800 flex flex-wrap gap-1.5 leading-relaxed">
                {result.solutions.map((sol) => (
                  <span
                    key={sol}
                    className="inline-block px-2 py-0.5 rounded bg-cyan-50 border border-cyan-200 font-semibold text-cyan-900"
                  >
                    {sol}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Mathematical Decomposition details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
            <div className="p-3 rounded-lg bg-white border border-slate-200">
              <span className="font-semibold text-slate-700 block mb-1">
                素因数基底 θ(n) の項 ((p, pᵉ)):
              </span>
              <div className="font-mono text-slate-600">
                {result.theta_terms && result.theta_terms.length > 0 ? (
                  result.theta_terms.map(([p, pe], idx) => (
                    <span key={idx} className="mr-2">
                      ({p}, {pe})
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400">なし</span>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-white border border-slate-200">
              <span className="font-semibold text-slate-700 block mb-1">
                乗法的分割 M(n) パターン数:
              </span>
              <div className="font-mono text-slate-600">
                {result.m_decompositions ? `${result.m_decompositions.length} パターン` : "0"}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
