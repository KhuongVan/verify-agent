/**
 * categories.ts — danh mục ngành hàng cố định (1 cấp).
 *
 * `id` là KHOÁ DỮ LIỆU: được lưu vào album và gửi lên Meta làm `content_category`,
 * nên không bao giờ đổi — đổi id là mất liên kết với dữ liệu cũ và với các tệp
 * audience đã dựng. `label` chỉ để hiển thị, sửa thoải mái.
 *
 * Giữ 1 cấp cho đơn giản; `parentId` chừa sẵn cho cấp 2. Bộ danh mục cố ý để thô
 * để sau này map được sang cây danh mục affiliate (Shopee/TikTok Shop, Accesstrade).
 */

export type Category = {
  id: string;
  label: string;
  parentId?: string;
};

/** Dùng khi người bán không chọn, hoặc client gửi lên giá trị lạ. */
export const FALLBACK_CATEGORY_ID = 'khac';

export const CATEGORIES: readonly Category[] = [
  { id: 'thoi-trang', label: 'Thời trang' },
  { id: 'my-pham', label: 'Mỹ phẩm & làm đẹp' },
  { id: 'phu-kien', label: 'Phụ kiện & trang sức' },
  { id: 'dien-tu', label: 'Điện tử & công nghệ' },
  { id: 'gia-dung', label: 'Gia dụng' },
  { id: 'noi-that', label: 'Nội thất & trang trí' },
  { id: 'do-an', label: 'Đồ ăn & thức uống' },
  { id: 'me-va-be', label: 'Mẹ & bé' },
  { id: 'the-thao', label: 'Thể thao & dã ngoại' },
  { id: 'sach', label: 'Sách & văn phòng phẩm' },
  { id: 'thu-cung', label: 'Thú cưng' },
  { id: FALLBACK_CATEGORY_ID, label: 'Khác' },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function isValidCategoryId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Chuẩn hoá giá trị đến từ client hoặc DB về một id hợp lệ. Không tin dữ liệu ngoài. */
export function normalizeCategoryId(id: unknown): string {
  return isValidCategoryId(id) ? id : FALLBACK_CATEGORY_ID;
}

export function categoryLabel(id: unknown): string {
  return BY_ID.get(normalizeCategoryId(id))!.label;
}