import { ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { db } from "~/utils/db.server";

export const action = async ({ params }: ActionFunctionArgs) => {
  const invoiceId = params.id;
  
  if (!invoiceId || isNaN(Number(invoiceId))) {
    return json({ success: false, error: "Mã hóa đơn không hợp lệ" }, { status: 400 });
  }
  
  try {
    // Check if invoice exists and is completed
    const invoice = await db.invoice.findUnique({
      where: {
        id: Number(invoiceId),
      },
    });
    
    if (!invoice) {
      return json({ success: false, error: "Không tìm thấy hóa đơn" }, { status: 404 });
    }
    
    if (invoice.status !== "COMPLETED") {
      return json(
        { success: false, error: "Chỉ có thể hủy hóa đơn có trạng thái hoàn thành" },
        { status: 400 }
      );
    }
    
    // Start a transaction to cancel the invoice and update inventory
    await db.$transaction(async (tx) => {
      // 1. Get all invoice items
      const invoiceItems = await tx.invoiceItem.findMany({
        where: {
          invoiceId: Number(invoiceId),
        },
        include: {
          product: true,
          productUnit: true,
        },
      });
      
      // 2. Return items to inventory
      for (const item of invoiceItems) {
        // Check if product exists in inventory with same batch/expiry
        const inventoryItem = await tx.inventory.findFirst({
          where: {
            productId: item.productId,
            productUnitId: item.productUnitId,
          },
        });
        
        if (inventoryItem) {
          // Update existing inventory
          await tx.inventory.update({
            where: {
              id: inventoryItem.id,
            },
            data: {
              quantity: inventoryItem.quantity + item.quantity,
            },
          });
        } else {
          // Create new inventory record
          await tx.inventory.create({
            data: {
              productId: item.productId,
              productUnitId: item.productUnitId,
              quantity: item.quantity,
              batchNumber: null,
              expiryDate: null,
            },
          });
        }
      }
      
      // 3. Update invoice status to CANCELLED
      await tx.invoice.update({
        where: {
          id: Number(invoiceId),
        },
        data: {
          status: "CANCELLED",
        },
      });
      
      // 4. Add cancellation note to transaction history (optional)
      await tx.transaction.create({
        data: {
          date: new Date(),
          type: "EXPENSE",
          amount: invoice.finalAmount,
          description: `Hủy hóa đơn ${invoice.code}`,
          userId: invoice.userId,
          relatedType: "INVOICE",
          invoiceId: invoice.id,
        },
      });
    });
    return redirect(`/admin/invoices`);
  } catch (error) {
    console.error("Lỗi khi hủy hóa đơn:", error);
    return json(
      { success: false, error: "Đã xảy ra lỗi khi hủy hóa đơn" },
      { status: 500 }
    );
  }
};
