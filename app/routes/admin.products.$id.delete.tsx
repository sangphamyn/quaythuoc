import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { db } from "~/utils/db.server";

export const action = async ({ params }: ActionFunctionArgs) => {
  const productId = params.id;
  
  if (!productId || isNaN(Number(productId))) {
    return redirect("/products");
  }
  
  try {
    // Kiểm tra xem sản phẩm có dữ liệu liên quan không
    const productWithRelations = await db.product.findUnique({
      where: { id: Number(productId) },
      include: {
        inventoryItems: { take: 1 },
        invoiceItems: { take: 1 },
        purchaseItems: { take: 1 }
      }
    });
    
    if (!productWithRelations) {
      throw new Response(
        "Không tìm thấy sản phẩm",
        { status: 404 }
      );
    }
    
    // Kiểm tra xem sản phẩm có đang có tồn kho không
    if (productWithRelations.inventoryItems.length > 0) {
      throw new Response(
        "Không thể xóa sản phẩm này vì đang có tồn kho. Vui lòng điều chỉnh tồn kho về 0 trước khi xóa.",
        { status: 400 }
      );
    }
    
    // Kiểm tra xem sản phẩm có xuất hiện trên hóa đơn không
    if (productWithRelations.invoiceItems.length > 0) {
      throw new Response(
        "Không thể xóa sản phẩm này vì đã được sử dụng trong hóa đơn bán hàng.",
        { status: 400 }
      );
    }
    
    // Kiểm tra xem sản phẩm có xuất hiện trên phiếu nhập không
    if (productWithRelations.purchaseItems.length > 0) {
      throw new Response(
        "Không thể xóa sản phẩm này vì đã được sử dụng trong phiếu nhập hàng.",
        { status: 400 }
      );
    }
    
    // Nếu không có dữ liệu liên quan, xóa sản phẩm
    // Đầu tiên xóa bảng ProductUnit
    await db.productUnit.deleteMany({
      where: {
        productId: Number(productId)
      }
    });
    
    // Sau đó xóa sản phẩm
    await db.product.delete({
      where: { 
        id: Number(productId) 
      }
    });
    
    return redirect("/products");
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    
    console.error("Lỗi khi xóa sản phẩm:", error);
    
    throw new Response(
      "Không thể xóa sản phẩm. Vui lòng thử lại sau.",
      { status: 500 }
    );
  }
};

// Không cần phần UI vì đây là route xử lý xóa
export const loader = () => redirect("/products");

export default function DeleteProduct() {
  return null;
}
