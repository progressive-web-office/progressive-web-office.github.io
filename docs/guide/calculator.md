---
description: The calculator of PWO — standard decimal arithmetic, scientific functions, and a programmer mode with every base, words of 8 to 64 bits and a grid of bits; offline, from the keyboard.
---

# Calculator

**🧮 Calculator** opens a calculator over what you are doing. You can open it
from the start screen, from the *Insert* menu of a text document, or by
typing *calculator* in the command palette (`Ctrl+Shift+P`). It computes on
your device and works offline. It reopens in the last mode you used.

Type an expression, or build it with the keys, then press **Enter** (or
**=**). The result is shown under the expression and read out by screen
readers. An error, such as a division by zero, is shown in its place.

## History and memory

The history lists your calculations, the latest first, for each mode. For
each one you can:

- **Edit** it: put the expression back to change it;
- **Use the result** in the expression being typed;
- **Copy** the result.

`ans` in an expression is the last result. The memory keys work on the last
result: **MS** stores it, **M+** and **M−** add it to or subtract it from
the memory, **MR** writes the memory into the expression and **MC** clears
it. The history and the memory are kept in this browser.

## Standard

The four operations, parentheses, **±** and percentages, computed in decimal:
`0.1 + 0.2` gives `0.3`. Additions, subtractions and multiplications are
exact. A division keeps 34 significant digits.

Percentages work as on a desk calculator:

| Expression | Result |
|---|---|
| `200 + 10%` | 220 (10 % added) |
| `200 − 10%` | 180 |
| `200 × 10%` | 20 |
| `50%` | 0.5 |

## Scientific

Everything above, plus:

- `sin`, `cos`, `tan`, their inverses `asin`, `acos`, `atan`, and the
  hyperbolic functions `sinh`, `cosh`, `tanh` (also `asinh`, `acosh`,
  `atanh`);
- `exp`, `ln`, `log` (base 10, or `log(x, b)` in base b), `log2`;
- `sqrt`, `cbrt`, `root(x, n)`, powers `x ^ y`, the factorial `n!`;
- `abs`, `floor`, `ceil`, `round` (halves away from zero), the remainder
  `a mod b`;
- combinations `nCr(n, k)` and arrangements `nPr(n, k)`;
- `rand()`, a random number between 0 and 1.

A product can be written without its sign: `2π`, `3(1 + 2)`. `1.5e3` is
1500.

- **Angles**: degrees, radians or grads.
- **Notation**: normal, scientific (`1.23e5`) or engineering, whose exponent
  is a multiple of 3 (`123e3`).
- **Significant digits**: from 1 to 17.
- **Constants**: π, e and φ, and physical constants, inserted from the
  *Constants* list. The speed of light, the Planck constant, the elementary
  charge, the Avogadro and Boltzmann constants and the gas constant have the
  exact values of the SI. The gravitational constant (CODATA 2018) and
  standard gravity are also listed.

## Programmer

Integers, shown at once in hexadecimal, decimal, octal and binary.

- **Typed in**: the base of the numbers you type. Whatever the base,
  `0x1F`, `0o17` and `0b101` are read in their own base. In hexadecimal,
  the keys A to F turn on; in octal and binary, the digits that do not
  exist turn off.
- **Word**: 8, 16, 32 or 64 bits, or no limit. A result wraps at the size
  of the word: on 8 signed bits, `127 + 1` gives `-128`.
- **Signed**: negative numbers in two's complement. Their hexadecimal,
  octal and binary forms show their bits: −1 on 8 bits is `FF`.
- **Operations**:
  - `and`, `or`, `xor`, `not`, `nand`, `nor`;
  - shifts `<<` and `>>`: `>>` keeps the sign of a signed word;
  - rotations `rol` and `ror`, which need a word size;
  - `÷`, which drops the fraction, and `mod`.
- **Bits**: the grid shows the bits of the result, the highest first. Click
  a bit, or press Space on it, to change it.

## From the keyboard

Everything can be done from the keyboard:

- **Tab** goes through the modes, the options, the expression, the keys and
  the history.
- On the modes, the **← →** arrows change the mode.
- In the expression, **Enter** computes.
- **Escape** closes the calculator.

Each key has a name for screen readers (for example *Square root* or
*Bitwise exclusive OR*), and the result is announced.
