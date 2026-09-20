import sympy as sy
import time
import os

from functools import lru_cache
from itertools import combinations
from concurrent.futures import ProcessPoolExecutor


@lru_cache(maxsize=None)
def divisors_tuple(n):
    return tuple(int(d) for d in sy.divisors(n))


@lru_cache(maxsize=None)
def theta_terms(n):
    """
    Θ(n) の各項を ((p, p^e), ...) の形で返す。
    """
    fac = sy.factorint(n)
    out = []

    # e = 1 の場合
    # n = p - 1
    p = n + 1

    if sy.isprime(p):
        out.append((int(p), int(p)))

    # e >= 2 の場合
    # n = (p - 1)p^(e - 1)
    for p, vp in fac.items():
        p = int(p)
        vp = int(vp)

        if n // (p ** vp) + 1 == p:
            out.append((p, p ** (vp + 1)))

    out.sort()
    return tuple(out)


def theta(n):
    return {value for _, value in theta_terms(n)}


def delta(n):
    T = theta(n)
    return T | {2 * x for x in T if x % 2 == 1}


def is_power_of_two(n):
    return n > 0 and (n & (n - 1)) == 0


def pair_can_contribute(d, e):
    # 定理6.44
    if d % 2 == 1:
        return False

    # 定理6.41
    if e >= 3:
        return False

    T = theta_terms(d)

    if len(T) == 0:
        return False

    # 定理6.42
    if len(T) == 1 and e != 1:
        return False

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

            for tail in M_cached(
                remaining // power,
                d + 1
            ):
                result.append(((d, e),) + tail)

            power *= d
            e += 1

    return tuple(result)


def M(n):
    return M_cached(n, 2)


def phi_inverse(n):
    Ms = M(n)

    # 定理6.41～6.45による除外
    valid_Ms = []

    for S in Ms:

        valid = True

        for d, e in S:

            if not pair_can_contribute(d, e):
                valid = False
                break

        if valid:
            valid_Ms.append(S)

    # 必要な d だけ集める
    needed_d = {
        d
        for S in valid_Ms
        for d, _ in S
    }

    # Θ(d) に現れる素数底
    primes = sorted({
        p
        for d in needed_d
        for p, _ in theta_terms(d)
    })

    p_to_bit = {
        p: i
        for i, p in enumerate(primes)
    }

    # (d,e) -> Θ(d)^(circledast e)
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

    # φ^(-1)(n) の計算
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
                        newT.add(
                            (a * b, ma | mb)
                        )

            if not newT:
                T = ()
                break

            T = newT

        # Δ(d) の処理
        for value, _ in T:

            ans.add(value)

            if value & 1:
                ans.add(value << 1)

    return ans


def phi_inverse_count(n):
    return len(phi_inverse(n))


def calculate_one_n(n):
    """
    1つの n を計算するワーカープロセス用関数。
    """
    start_time = time.perf_counter()

    result = phi_inverse(n)

    end_time = time.perf_counter()
    elapsed = end_time - start_time

    return (
        n,
        result,
        len(result),
        elapsed
    )


def calculate_range(start_n, end_n, max_workers=None):
    """
    start_n から end_n までをCPU並列で計算する。

    Parameters
    ----------
    start_n : int
        計算開始値。
    end_n : int
        計算終了値。
    max_workers : int | None
        使用するプロセス数。
        None の場合は利用可能なCPUコア数を使用する。

    Returns
    -------
    tuple
        各 n について

        (n, φ^(-1)(n), |φ^(-1)(n)|, 処理時間)

        のタプルを返す。
    """

    results = []

    with ProcessPoolExecutor(
        max_workers=max_workers
    ) as executor:

        for result in executor.map(
            calculate_one_n,
            range(start_n, end_n + 1)
        ):
            results.append(result)

    return tuple(results)


if __name__ == "__main__":
    import sys
    test_n = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    solutions = sorted(list(phi_inverse(test_n)))
    print(f"phi^(-1)({test_n}) = {solutions} (count: {len(solutions)})")
