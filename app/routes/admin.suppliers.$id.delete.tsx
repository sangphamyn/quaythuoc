import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/utils/db.server";

export const action = async ({ params }: ActionFunctionArgs) => {
  const supplierId = params.id;
  
  if (!supplierId || isNaN(Number(supplierId))) {
    return redirect("/admin/suppliers");
  }
  
  try {
    // Kiểm tra xem nhà cung cấp có đơn nhập hàng không
    const purchaseOrderCount = await db.purchaseOrder.count({
      where: { supplierId: Number(supplierId) }
    });
    
    if (purchaseOrderCount > 0) {
      throw new Response(
        "Không thể xóa nhà cung cấp này vì đã có đơn nhập hàng liên quan",
        { status: 400 }
      );
    }
    
    // Xóa nhà cung cấp
    await db.supplier.delete({
      where: { id: Number(supplierId) }
    });
    
    return redirect("/admin/suppliers");
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    
    console.error("Lỗi khi xóa nhà cung cấp:", error);
    
    throw new Response(
      "Không thể xóa nhà cung cấp. Vui lòng thử lại sau.",
      { status: 500 }
    );
  }
};

// Không cần phần UI vì đây là route xử lý xóa
export const loader = () => redirect("/admin/suppliers");

export default function DeleteSupplier() {
  return null;
}
