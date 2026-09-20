"""
Endo_method.py - オイラーのトーシェント関数逆像 φ^(-1)(n) の計算モジュール
Endo's Method for computing the inverse of Euler's totient function:
Solve phi(x) = n for all positive integers x.
"""

from functools import lru_cache
from itertools import combinations
import sympy as sy


@lru_cache(maxsize=None)
def divisors_tuple(n: int):
    """n の正の約数を昇順タプルで返す"""
    return tuple(int(d) for d in sy.divisors(n))


@lru_cache(maxsize=None)
def theta_terms(n: int):
    """
    返り値: ((p, p^e), ...) の形
    n = (p - 1)p^(e-1) を満たす素数 p とそのべき p^e のペアを昇順タプルで返す
    """
    fac = sy.factorint(n)
    out = []

    # e = 1 の場合: n = p - 1  => p = n + 1
    p = n + 1
    if sy.isprime(p):
        out.append((int(p), int(p)))

    # e >= 2 の場合:
    # n = (p - 1)p^(e - 1) なら、v_p(n) = e - 1 なので
    # n / p^v_p(n) = p - 1 を満たす p を調べればよい
    for p, vp in fac.items():
        p = int(p)
        vp = int(vp)
        if n // (p ** vp) + 1 == p:
            out.append((p, p ** (vp + 1)))

    out.sort()
    return tuple(out)


def theta(n: int):
    """n に対する theta 集合（値のみの集合）"""
    return {value for _, value in theta_terms(n)}


def delta(n: int):
    """n に対する delta 集合"""
    T = theta(n)
    return T | {2 * x for x in T if x % 2 == 1}


@lru_cache(maxsize=None)
def M_cached(remaining: int, start: int):
    """
    frozenset ではなく、昇順タプル ((d1,e1), (d2,e2), ...) で保持する。
    d を strictly increasing にしているので重複除去用の set が不要。
    """
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


def M(n: int):
    """n の乗法的分割の集合 M(n)"""
    return M_cached(n, 2)


def phi_inverse(n: int) -> set:
    """
    オイラー関数の方程式 φ(x) = n を満たす正整数 x の集合を返す。
    n が奇数かつ n > 1 の場合は解なし (空集合)。
    """
    if n <= 0:
        return set()
    if n == 1:
        return {1, 2}
    if n % 2 == 1 and n > 1:
        return set()

    Ms = M(n)

    # 実際に必要な d だけ集める
    needed_d = {d for S in Ms for d, _ in S}

    # theta(d) に現れる素数底を全部集めて bit を振る
    primes = sorted({p for d in needed_d for p, _ in theta_terms(d)})
    p_to_bit = {p: i for i, p in enumerate(primes)}

    # (d, e) -> ((value, mask), ...) をローカルキャッシュ
    power_cache = {}

    def theta_power_terms(d, e):
        """
        circledast_power(theta(d), e) を直接作る。
        各項を (値, 使用した素数のビットマスク) で持つ。
        """
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

    for S in Ms:
        # T は (値, 使用素数マスク) の集合
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

        # 最後の circledast(_, {1,2}) を専用処理
        for value, _ in T:
            ans.add(value)
            if value & 1:
                ans.add(value << 1)

    return ans


def phi_inverse_count(n: int) -> int:
    """φ(x) = n の解の個数を返す"""
    return len(phi_inverse(n))


if __name__ == "__main__":
    import sys
    test_n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    solutions = sorted(list(phi_inverse(test_n)))
    print(f"phi^(-1)({test_n}) = {solutions} (count: {len(solutions)})")
