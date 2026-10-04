/**
 * worker_engine.js
 * Web Worker for Browser Distributed Computing Node
 * 
 * Supports:
 * 1. Pyodide-powered Python execution of Endo_method (with zero UI blocking)
 * 2. High-performance fallback math engine for offline/instant execution
 * 3. Progressive real-time heartbeat and telemetry dispatch
 */

let pyodideInstance = null;
let isPyodideReady = false;
let currentTaskRunning = false;
let shouldStopCurrentTask = false;

// Embedded pure Python Endo Method script
const PYTHON_ENDO_SCRIPT = `
import time

class _MathShim:
    @staticmethod
    def isprime(n: int) -> bool:
        if n < 2: return False
        if n in (2, 3): return True
        if n % 2 == 0 or n % 3 == 0: return False
        d = 5
        while d * d <= n:
            if n % d == 0 or n % (d + 2) == 0:
                return False
            d += 6
        return True

    @staticmethod
    def factorint(n: int) -> dict:
        factors = {}
        d = 2
        while d * d <= n:
            while n % d == 0:
                factors[d] = factors.get(d, 0) + 1
                n //= d
            d = 3 if d == 2 else d + 2
        if n > 1:
            factors[n] = factors.get(n, 0) + 1
        return factors

    @staticmethod
    def divisors(n: int) -> list:
        divs = []
        d = 1
        while d * d <= n:
            if n % d == 0:
                divs.append(d)
                if d * d != n:
                    divs.append(n // d)
            d += 1
        divs.sort()
        return divs

sy = _MathShim()

from functools import lru_cache
from itertools import combinations

@lru_cache(maxsize=None)
def divisors_tuple(n):
    return tuple(int(d) for d in sy.divisors(n))

@lru_cache(maxsize=None)
def theta_terms(n):
    fac = sy.factorint(n)
    out = []
    p = n + 1
    if sy.isprime(p):
        out.append((int(p), int(p)))
    for p, vp in fac.items():
        p = int(p)
        vp = int(vp)
        if n // (p ** vp) + 1 == p:
            out.append((p, p ** (vp + 1)))
    out.sort()
    return tuple(out)

def pair_can_contribute(d, e):
    if d % 2 == 1: return False
    if e >= 3: return False
    T = theta_terms(d)
    if len(T) == 0: return False
    if len(T) == 1 and e != 1: return False
    return True

@lru_cache(maxsize=None)
def M_cached(remaining, start):
    if remaining == 1:
        return ((),)
    result = []
    for d in divisors_tuple(remaining):
        if d == 1 or d < start:
            continue
        power = d
        e = 1
        while remaining % power == 0:
            for tail in M_cached(remaining // power, d + 1):
                result.append(((d, e),) + tail)
            power *= d
            e += 1
    return tuple(result)

def M(n):
    return M_cached(n, 2)

def phi_inverse(n):
    Ms = M(n)
    valid_Ms = []
    for S in Ms:
        valid = True
        for d, e in S:
            if not pair_can_contribute(d, e):
                valid = False
                break
        if valid:
            valid_Ms.append(S)

    needed_d = {d for S in valid_Ms for d, _ in S}
    primes = sorted({p for d in needed_d for p, _ in theta_terms(d)})
    p_to_bit = {p: i for i, p in enumerate(primes)}

    power_cache = {}
    def theta_power_terms(d, e):
        key = (d, e)
        if key in power_cache:
            return power_cache[key]
        terms = theta_terms(d)
        if e == 0:
            ans = ((1, 0),)
        elif e > len(terms):
            ans = ()
        else:
            out = []
            for comb in combinations(terms, e):
                value = 1
                mask = 0
                for p, pe in comb:
                    value *= pe
                    mask |= 1 << p_to_bit[p]
                out.append((value, mask))
            ans = tuple(out)
        power_cache[key] = ans
        return ans

    ans = set()
    for S in valid_Ms:
        T = {(1, 0)}
        for d, e in S:
            Td = theta_power_terms(d, e)
            if not Td:
                T = ()
                break
            newT = set()
            for a, ma in T:
                for b, mb in Td:
                    if (ma & mb) == 0:
                        newT.add((a * b, ma | mb))
            if not newT:
                T = ()
                break
            T = newT

        for value, _ in T:
            ans.add(value)
            if value & 1:
                ans.add(value << 1)

    return sorted(list(ans))
`;

// Pure JavaScript Endo Method Implementation (High-performance fallback)
function jsIsPrime(n) {
  if (n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let d = 5; d * d <= n; d += 6) {
    if (n % d === 0 || n % (d + 2) === 0) return false;
  }
  return true;
}

function jsFactorInt(n) {
  const factors = {};
  let d = 2;
  while (d * d <= n) {
    while (n % d === 0) {
      factors[d] = (factors[d] || 0) + 1;
      n = Math.floor(n / d);
    }
    d = d === 2 ? 3 : d + 2;
  }
  if (n > 1) {
    factors[n] = (factors[n] || 0) + 1;
  }
  return factors;
}

function jsDivisors(n) {
  const divs = [];
  for (let d = 1; d * d <= n; d++) {
    if (n % d === 0) {
      divs.push(d);
      if (d * d !== n) {
        divs.push(Math.floor(n / d));
      }
    }
  }
  divs.sort((a, b) => a - b);
  return divs;
}

const thetaCache = new Map();
function jsThetaTerms(n) {
  if (thetaCache.has(n)) return thetaCache.get(n);
  const fac = jsFactorInt(n);
  const out = [];
  const p = n + 1;
  if (jsIsPrime(p)) {
    out.push([p, p]);
  }
  for (const [pStr, vp] of Object.entries(fac)) {
    const pVal = parseInt(pStr, 10);
    const pPow = Math.pow(pVal, vp);
    if (Math.floor(n / pPow) + 1 === pVal) {
      out.push([pVal, Math.pow(pVal, vp + 1)]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  thetaCache.set(n, out);
  return out;
}

function jsPairCanContribute(d, e) {
  if (d % 2 === 1) return false;
  if (e >= 3) return false;
  const T = jsThetaTerms(d);
  if (T.length === 0) return false;
  if (T.length === 1 && e !== 1) return false;
  return true;
}

const mCache = new Map();
function jsMCached(remaining, start) {
  const key = `${remaining},${start}`;
  if (mCache.has(key)) return mCache.get(key);
  if (remaining === 1) return [[]];

  const result = [];
  const divs = jsDivisors(remaining);
  for (const d of divs) {
    if (d === 1 || d < start) continue;
    let power = d;
    let e = 1;
    while (remaining % power === 0) {
      const sub = jsMCached(Math.floor(remaining / power), d + 1);
      for (const tail of sub) {
        result.push([[d, e], ...tail]);
      }
      power *= d;
      e += 1;
    }
  }
  mCache.set(key, result);
  return result;
}

function jsCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0 || k > arr.length) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = jsCombinations(tail, k - 1).map(c => [head, ...c]);
  const withoutHead = jsCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

function jsPhiInverse(n) {
  const Ms = jsMCached(n, 2);
  const validMs = [];
  for (const S of Ms) {
    let valid = true;
    for (const [d, e] of S) {
      if (!jsPairCanContribute(d, e)) {
        valid = false;
        break;
      }
    }
    if (valid) validMs.push(S);
  }

  const neededD = new Set();
  for (const S of validMs) {
    for (const [d] of S) {
      neededD.add(d);
    }
  }

  const primesSet = new Set();
  for (const d of neededD) {
    for (const [p] of jsThetaTerms(d)) {
      primesSet.add(p);
    }
  }
  const primes = Array.from(primesSet).sort((a, b) => a - b);
  const pToBit = new Map();
  primes.forEach((p, idx) => pToBit.set(p, idx));

  const powerCache = new Map();
  function thetaPowerTerms(d, e) {
    const key = `${d},${e}`;
    if (powerCache.has(key)) return powerCache.get(key);
    const terms = jsThetaTerms(d);
    let ans;
    if (e === 0) {
      ans = [[1, 0]];
    } else if (e > terms.length) {
      ans = [];
    } else {
      const combs = jsCombinations(terms, e);
      ans = combs.map(comb => {
        let val = 1;
        let mask = 0;
        for (const [p, pe] of comb) {
          val *= pe;
          mask |= (1 << pToBit.get(p));
        }
        return [val, mask];
      });
    }
    powerCache.set(key, ans);
    return ans;
  }

  const ans = new Set();
  for (const S of validMs) {
    let T = [[1, 0]];
    for (const [d, e] of S) {
      const Td = thetaPowerTerms(d, e);
      if (Td.length === 0) {
        T = [];
        break;
      }
      const newT = [];
      const seen = new Set();
      for (const [a, ma] of T) {
        for (const [b, mb] of Td) {
          if ((ma & mb) === 0) {
            const val = a * b;
            const mask = ma | mb;
            const k = `${val},${mask}`;
            if (!seen.has(k)) {
              seen.add(k);
              newT.push([val, mask]);
            }
          }
        }
      }
      if (newT.length === 0) {
        T = [];
        break;
      }
      T = newT;
    }

    for (const [val] of T) {
      ans.add(val);
      if (val % 2 === 1) {
        ans.add(val * 2);
      }
    }
  }

  return Array.from(ans).sort((a, b) => a - b);
}

// Initialize Pyodide
async function initPyodide() {
  try {
    if (typeof importScripts === "function") {
      try {
        importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");
      } catch {
        isPyodideReady = false;
        return;
      }
    }
    if (typeof loadPyodide !== "function") {
      isPyodideReady = false;
      return;
    }
    pyodideInstance = await loadPyodide();
    await pyodideInstance.runPythonAsync(PYTHON_ENDO_SCRIPT);
    isPyodideReady = true;
    postMessage({ type: "READY", engine: "Pyodide (WebAssembly Python)" });
  } catch {
    isPyodideReady = false;
  }
}

// Calculate single n
function calculateSingleN(n) {
  if (isPyodideReady && pyodideInstance) {
    try {
      const pyCode = `phi_inverse(${n})`;
      const proxy = pyodideInstance.runPython(pyCode);
      const res = proxy.toJs();
      proxy.destroy();
      return Array.isArray(res) ? res : Array.from(res || []);
    } catch (e) {
      return jsPhiInverse(n);
    }
  } else {
    return jsPhiInverse(n);
  }
}

// Task execution loop
async function runTask(taskId, startN, endN) {
  currentTaskRunning = true;
  shouldStopCurrentTask = false;
  const tStart = performance.now();

  const totalN = Math.max(1, endN - startN + 1);
  let totalSolutions = 0;
  let solvableCount = 0;
  const sampleSolutions = {};
  const counts = {};

  let lastProgressReportTime = performance.now();

  try {
    for (let currentN = startN; currentN <= endN; currentN++) {
      if (shouldStopCurrentTask) {
        postMessage({ type: "TASK_ABORTED", task_id: taskId });
        return;
      }

      const solutions = calculateSingleN(currentN);
      const solCount = solutions.length;
      totalSolutions += solCount;
      if (solCount > 0) solvableCount++;
      counts[currentN] = solCount;

      if (Object.keys(sampleSolutions).length < 5 || (solCount > 0 && Object.keys(sampleSolutions).length < 15)) {
        sampleSolutions[currentN] = solutions;
      }

      const now = performance.now();
      // Report progress every 300ms or on completion
      if (now - lastProgressReportTime >= 300 || currentN === endN) {
        const processed = currentN - startN + 1;
        const elapsedSec = (now - tStart) / 1000;
        const speed = elapsedSec > 0 ? Math.round(processed / elapsedSec) : 0;
        const pct = Math.min(100, Math.round((processed / totalN) * 1000) / 10);

        postMessage({
          type: "PROGRESS",
          task_id: taskId,
          current_n: currentN,
          processed: processed,
          total_n: totalN,
          pct: pct,
          total_solutions: totalSolutions,
          solvable_count: solvableCount,
          speed: speed,
          last_found: solCount > 0 ? { n: currentN, count: solCount, sample: solutions.slice(0, 8) } : null
        });

        lastProgressReportTime = now;
        // Yield thread briefly for message processing
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const durationSec = Math.round(((performance.now() - tStart) / 1000) * 1000) / 1000;

    const resultData = {
      task_id: taskId,
      start: startN,
      end: endN,
      count: totalN,
      total_solutions: totalSolutions,
      solvable_count: solvableCount,
      sample_solutions: sampleSolutions,
      counts: counts,
      duration_sec: durationSec
    };

    postMessage({
      type: "TASK_DONE",
      task_id: taskId,
      result: resultData
    });
  } catch (err) {
    postMessage({
      type: "ERROR",
      task_id: taskId,
      text: err && err.message ? err.message : String(err)
    });
  } finally {
    currentTaskRunning = false;
  }
}

self.onmessage = async (e) => {
  const data = e.data;
  if (!data) return;

  const action = (data.action || data.type || "").toUpperCase();

  if (action === "INIT") {
    postMessage({ type: "READY", engine: "Endo JS Math Engine (Turbo)" });
    initPyodide().catch(() => {});
  } else if (action === "CALCULATE" || action === "START_TASK" || action === "START") {
    await runTask(data.task_id, data.start, data.end);
  } else if (action === "STOP" || action === "PAUSE") {
    shouldStopCurrentTask = true;
  }
};
