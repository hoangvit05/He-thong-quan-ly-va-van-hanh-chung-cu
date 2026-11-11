// =========================================================================
// TIỆN ÍCH SINH SỐ NGẪU NHIÊN ĐƠN ĐỊNH (DETERMINISTIC PRNG)
// Thuật toán: Mulberry32 (Chu kỳ dài, đồng nhất, hiệu năng cao, hoàn toàn độc lập)
// =========================================================================

export class PRNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /**
   * Sinh số thực ngẫu nhiên trong khoảng [0, 1)
   */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Sinh số nguyên ngẫu nhiên trong đoạn [min, max]
   */
  nextInt(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(this.next() * (hi - lo + 1)) + lo;
  }

  /**
   * Sinh số thực ngẫu nhiên trong đoạn [min, max] với số chữ số thập phân chỉ định
   */
  nextFloat(min: number, max: number, decimals = 2): number {
    const val = this.next() * (max - min) + min;
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  /**
   * Chọn ngẫu nhiên 1 phần tử trong mảng
   */
  pickOne<T>(items: readonly T[]): T {
    if (!items || items.length === 0) {
      throw new Error('Không thể chọn phần tử từ mảng rỗng.');
    }
    const idx = this.nextInt(0, items.length - 1);
    return items[idx];
  }

  /**
   * Chọn theo trọng số (Weighted pick)
   */
  pickWeighted<T>(items: Array<{ type: T; weight: number }>): T {
    const totalWeight = items.reduce((sum, it) => sum + it.weight, 0);
    let r = this.next() * totalWeight;
    for (const item of items) {
      if (r < item.weight) {
        return item.type;
      }
      r -= item.weight;
    }
    return items[items.length - 1].type;
  }

  /**
   * Xáo trộn mảng (Fisher-Yates shuffle)
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = result[i];
      result[i] = result[j];
      result[j] = temp;
    }
    return result;
  }
}

