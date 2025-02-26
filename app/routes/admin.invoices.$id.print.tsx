import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const invoiceId = params.id;
  
  if (!invoiceId || isNaN(Number(invoiceId))) {
    throw json({ message: "Mã hóa đơn không hợp lệ" }, { status: 400 });
  }
  
  const [invoice] = await Promise.all([
    db.invoice.findUnique({
      where: {
        id: Number(invoiceId),
      },
      include: {
        user: true,
        items: {
          include: {
            product: true,
            productUnit: {
              include: {
                unit: true,
              },
            },
          },
        },
      },
    })
  ]);
  
  if (!invoice) {
    throw json({ message: "Không tìm thấy hóa đơn" }, { status: 404 });
  }
  
  // Parse shop info or use defaults
  let shopName = "Nhà thuốc";
  let shopAddress = "Địa chỉ nhà thuốc";
  let shopPhone = "Số điện thoại";
  let shopTaxCode = "";
  
  
  return json({
    invoice,
    shopInfo: {
      name: shopName,
      address: shopAddress,
      phone: shopPhone,
      taxCode: shopTaxCode,
    },
  });
};

export default function InvoicePrint() {
  const { invoice, shopInfo } = useLoaderData<typeof loader>();
  
  // Auto print when page loads
  useEffect(() => {
    window.print();
  }, []);
  
  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("vi-VN") + " đ";
  };
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("vi-VN");
  };
  
  // Format time
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("vi-VN", { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  // Translate payment method
  const translatePaymentMethod = (method: string) => {
    switch (method) {
      case "CASH":
        return "Tiền mặt";
      case "TRANSFER":
        return "Chuyển khoản";
      case "CREDIT":
        return "Công nợ";
      default:
        return method;
    }
  };
  
  // Number to words function (Vietnamese)
  const numberToWords = (num: number) => {
    // This is a simplified version - you might want to use a more complete library
    if (num === 0) return "Không đồng";
    
    const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
    const teens = ['mười', 'mười một', 'mười hai', 'mười ba', 'mười bốn', 'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín'];
    const tens = ['', '', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];
    
    const numberToWordsLessThan1000 = (n: number): string => {
      if (n < 10) return units[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) {
        return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
      }
      return units[Math.floor(n / 100)] + ' trăm' + (n % 100 !== 0 ? ' ' + numberToWordsLessThan1000(n % 100) : '');
    };
    
    const chunks = [];
    let remainder = num;
    
    while (remainder > 0) {
      chunks.push(remainder % 1000);
      remainder = Math.floor(remainder / 1000);
    }
    
    const scales = ['', ' nghìn', ' triệu', ' tỷ'];
    
    const words = chunks.map((chunk, i) => {
      if (chunk === 0) return '';
      return numberToWordsLessThan1000(chunk) + scales[i];
    }).reverse().filter(Boolean).join(' ');
    
    return words + ' đồng';
  };
  
  return (
    <div className=" bg-white p-6 max-w-3xl mx-auto print:max-w-none print:mx-0 print:p-0">
      <div className="print-hidden mb-4 text-right">
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
        >
          In hóa đơn
        </button>
      </div>
      
      {/* Invoice Header */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold uppercase">{shopInfo.name}</h1>
        <p className="text-sm">{shopInfo.address}</p>
        <p className="text-sm">Số điện thoại: {shopInfo.phone}</p>
        {shopInfo.taxCode && (
          <p className="text-sm">Mã số thuế: {shopInfo.taxCode}</p>
        )}
        <h2 className="text-xl font-bold mt-6 mb-2">HÓA ĐƠN BÁN HÀNG</h2>
        <p className="text-sm">Mã hóa đơn: {invoice.code}</p>
        <p className="text-sm">Ngày: {formatDate(invoice.invoiceDate)} {formatTime(invoice.invoiceDate)}</p>
      </div>
      
      {/* Customer Information */}
      <div className="mb-6">
        <p className="text-sm">
          <span className="font-medium">Khách hàng:</span> {invoice.customerName || "Khách lẻ"}
        </p>
        {invoice.customerPhone && (
          <p className="text-sm">
            <span className="font-medium">Số điện thoại:</span> {invoice.customerPhone}
          </p>
        )}
        <p className="text-sm">
          <span className="font-medium">Thu ngân:</span> {invoice.user.fullName}
        </p>
        <p className="text-sm">
          <span className="font-medium">Phương thức thanh toán:</span> {translatePaymentMethod(invoice.paymentMethod)}
        </p>
      </div>
      
      {/* Invoice Items */}
      <div className="mb-6">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-2 text-left text-sm w-8">STT</th>
              <th className="py-2 text-left text-sm">Sản phẩm</th>
              <th className="py-2 text-center text-sm w-16">ĐVT</th>
              <th className="py-2 text-center text-sm w-16">SL</th>
              <th className="py-2 text-right text-sm w-24">Đơn giá</th>
              <th className="py-2 text-right text-sm w-28">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={item.id} className="border-b border-gray-200">
                <td className="py-2 text-sm">{index + 1}</td>
                <td className="py-2 text-sm">{item.product.name}</td>
                <td className="py-2 text-sm text-center">{item.productUnit.unit.name}</td>
                <td className="py-2 text-sm text-center">{item.quantity}</td>
                <td className="py-2 text-sm text-right">{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 text-sm text-right">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b border-gray-200">
              <td colSpan={5} className="py-2 text-sm text-right font-medium">Tổng tiền:</td>
              <td className="py-2 text-sm text-right font-medium">{formatCurrency(invoice.totalAmount)}</td>
            </tr>
            {invoice.discount > 0 && (
              <tr className="border-b border-gray-200">
                <td colSpan={5} className="py-2 text-sm text-right font-medium">Giảm giá:</td>
                <td className="py-2 text-sm text-right font-medium">{formatCurrency(invoice.discount)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} className="py-2 text-sm text-right font-bold">Thành tiền:</td>
              <td className="py-2 text-sm text-right font-bold">{formatCurrency(invoice.finalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      
      {/* Amount in words */}
      <div className="mb-6 text-sm italic">
        <p>Bằng chữ: {numberToWords(invoice.finalAmount)}</p>
      </div>
      
      {/* Notes */}
      {invoice.notes && (
        <div className="mb-6 text-sm">
          <p><span className="font-medium">Ghi chú:</span> {invoice.notes}</p>
        </div>
      )}
      
      {/* Footer */}
      <div className="text-center text-sm mt-8">
        <p>Cảm ơn quý khách đã mua hàng!</p>
        <p className="mt-1">Hẹn gặp lại quý khách lần sau</p>
      </div>
      
      {/* Signatures - only for printing */}
      <div className="mt-8 grid grid-cols-2 gap-8 text-center">
        <div>
          <p className="font-medium text-sm">Người bán hàng</p>
          <p className="text-xs italic mt-1">(Ký, ghi rõ họ tên)</p>
          <div className="h-16"></div>
          <p className="text-sm">{invoice.user.fullName}</p>
        </div>
        <div>
          <p className="font-medium text-sm">Người mua hàng</p>
          <p className="text-xs italic mt-1">(Ký, ghi rõ họ tên)</p>
          <div className="h-16"></div>
          <p className="text-sm">{invoice.customerName || "Khách lẻ"}</p>
        </div>
      </div>
      
      {/* Print styling */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A6;
            margin: 10mm;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          
        }
      `}} />
    </div>
  );
}
