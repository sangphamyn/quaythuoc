import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const productId = params.id;
  
  if (!productId || isNaN(Number(productId))) {
    return redirect("/admin/products");
  }
  
  const product = await db.product.findUnique({
    where: { id: Number(productId) },
    include: {
      category: true,
      usageRoute: true,
      compartment: {
        include: {
          row: {
            include: {
              cabinet: true
            }
          }
        }
      },
      productUnits: {
        include: {
          unit: true,
          inventoryItems: true,
          purchaseItems: {
            include: {
              purchaseOrder: {
                include: {
                  supplier: true
                }
              }
            },
            take: 5,
            orderBy: {
              purchaseOrder: {
                orderDate: "desc"
              }
            }
          },
          invoiceItems: {
            include: {
              invoice: true
            },
            take: 5,
            orderBy: {
              invoice: {
                invoiceDate: "desc"
              }
            }
          }
        }
      },
      inventoryItems: {
        include: {
          productUnit: {
            include: {
              unit: true
            }
          }
        }
      }
    }
  });
  
  if (!product) {
    throw new Response("Không tìm thấy sản phẩm", { status: 404 });
  }
  
  return json({ product });
};

export default function ProductDetail() {
  const { product } = useLoaderData<typeof loader>();
  
  // Find the base unit
  const baseUnit = product.productUnits.find(unit => unit.isBaseUnit);
  
  // Calculate total inventory in base units
  const totalInventory = product.inventoryItems.reduce((total, item) => {
    const productUnit = product.productUnits.find(pu => pu.id === item.productUnitId);
    if (!productUnit) return total;
    
    // Convert to base unit if needed
    const quantity = productUnit.isBaseUnit 
      ? item.quantity 
      : item.quantity * productUnit.conversionFactor;
      
    return total + quantity;
  }, 0);
  
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Chi tiết sản phẩm</h1>
        <div className="flex gap-2">
          <Link
            to="/admin/products"
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            <span>Quay lại</span>
          </Link>
          <Link
            to={`/admin/products/${product.id}/edit`}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            <span>Chỉnh sửa</span>
          </Link>
        </div>
      </div>
      
      {/* Product summary section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Product basic info */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden col-span-2">
          <div className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
                <span className="inline-block bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-md mt-1">
                  Mã SP: {product.code}
                </span>
              </div>
              {product.image && (
                <img 
                  src={product.image} 
                  alt={product.name} 
                  className="w-24 h-24 object-cover rounded-md"
                />
              )}
            </div>
            
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Danh mục</p>
                <p className="font-semibold">{product.category.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Đường dùng</p>
                <p className="font-semibold">{product.usageRoute?.name || "Không có"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Đơn vị cơ bản</p>
                <p className="font-semibold">{baseUnit?.unit.name || "Chưa thiết lập"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Vị trí</p>
                <p className="font-semibold">
                  {product.compartment 
                    ? `${product.compartment.row.cabinet.name} > ${product.compartment.row.name} > ${product.compartment.name}`
                    : "Chưa phân loại"
                  }
                </p>
              </div>
            </div>
            
            {product.description && (
              <div className="mt-6">
                <p className="text-sm text-gray-500">Mô tả</p>
                <p className="mt-1">{product.description}</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Inventory summary */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Tổng quan tồn kho</h3>
            
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Tổng tồn kho</span>
                <span className="text-xl font-bold">
                  {totalInventory.toFixed(2)} {baseUnit?.unit.name || ""}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className={`h-2.5 rounded-full ${totalInventory > 0 ? 'bg-green-600' : 'bg-red-600'}`}
                  style={{ width: `${Math.min(totalInventory > 0 ? 100 : 0, 100)}%` }}
                ></div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium text-gray-700">Theo đơn vị</h4>
              {product.productUnits.map(productUnit => {
                // Calculate total inventory for this unit
                const unitInventory = product.inventoryItems
                  .filter(item => item.productUnitId === productUnit.id)
                  .reduce((sum, item) => sum + item.quantity, 0);
                
                return (
                  <div key={productUnit.id} className="flex justify-between items-center">
                    <span className="text-gray-600">{productUnit.unit.name}</span>
                    <span className="font-semibold">{unitInventory.toFixed(2)}</span>
                  </div>
                );
              })}
              
              <Link 
                to={`/admin/products/${product.id}/inventory`}
                className="block text-center mt-6 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Xem chi tiết tồn kho
              </Link>
            </div>
          </div>
          
          <div className="bg-gray-50 px-6 py-4 border-t">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-500">Giá vốn cơ bản</p>
                <p className="font-semibold">
                  {baseUnit ? baseUnit.costPrice.toLocaleString("vi-VN") : "—"} đ
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Giá bán cơ bản</p>
                <p className="font-semibold">
                  {baseUnit ? baseUnit.sellingPrice.toLocaleString("vi-VN") : "—"} đ
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Product units section */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Đơn vị tính</h3>
        </div>
        <div className="p-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Đơn vị
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hệ số quy đổi
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Giá vốn
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Giá bán
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mặc định
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {product.productUnits.map(unit => (
                <tr key={unit.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {unit.unit.name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {unit.conversionFactor.toFixed(unit.conversionFactor % 1 === 0 ? 0 : 2)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {unit.costPrice.toLocaleString("vi-VN")} đ
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {unit.sellingPrice.toLocaleString("vi-VN")} đ
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    {unit.isBaseUnit && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                        Đơn vị cơ bản
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Inventory details */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Chi tiết tồn kho</h3>
        </div>
        <div className="p-6">
          {product.inventoryItems.length > 0 ? (
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Đơn vị
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số lượng
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lô
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hạn sử dụng
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {product.inventoryItems.map(item => {
                  const isExpired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;
                  const isExpiringSoon = item.expiryDate ? 
                    (new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24) < 30 : 
                    false;
                  
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {item.productUnit.unit.name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {item.quantity.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {item.batchNumber || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString("vi-VN") : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {isExpired ? (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">
                            Hết hạn
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                            Sắp hết hạn
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                            Còn hạn
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-6 text-gray-500">
              Sản phẩm chưa có tồn kho
            </div>
          )}
        </div>
      </div>
      
      {/* Recent transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent purchases */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">Nhập hàng gần đây</h3>
          </div>
          <div className="p-6">
            {product.productUnits.flatMap(unit => unit.purchaseItems).length > 0 ? (
              <div className="space-y-4">
                {product.productUnits.flatMap(unit => 
                  unit.purchaseItems.map(item => ({
                    ...item,
                    unitName: unit.unit.name
                  }))
                )
                .sort((a, b) => new Date(b.purchaseOrder.orderDate).getTime() - new Date(a.purchaseOrder.orderDate).getTime())
                .slice(0, 5)
                .map(item => (
                  <div key={item.id} className="border border-gray-200 rounded-md p-3">
                    <div className="flex justify-between">
                      <div>
                        <span className="text-xs text-gray-500">
                          {new Date(item.purchaseOrder.orderDate).toLocaleDateString("vi-VN")}
                        </span>
                        <p className="font-medium">
                          <Link 
                            to={`/purchase-orders/${item.purchaseOrderId}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {item.purchaseOrder.code}
                          </Link>
                        </p>
                        <p className="text-sm text-gray-600">
                          {item.purchaseOrder.supplier.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{item.quantity} {item.unitName}</p>
                        <p className="text-sm text-gray-600">
                          {item.costPrice.toLocaleString("vi-VN")} đ/{item.unitName}
                        </p>
                      </div>
                    </div>
                    {item.batchNumber && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-sm">
                        <span className="text-gray-500">Lô:</span> {item.batchNumber}
                        {item.expiryDate && (
                          <span className="ml-3">
                            <span className="text-gray-500">HSD:</span> {new Date(item.expiryDate).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                Chưa có nhập hàng
              </div>
            )}
          </div>
        </div>
        
        {/* Recent sales */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">Bán hàng gần đây</h3>
          </div>
          <div className="p-6">
            {product.productUnits.flatMap(unit => unit.invoiceItems).length > 0 ? (
              <div className="space-y-4">
                {product.productUnits.flatMap(unit => 
                  unit.invoiceItems.map(item => ({
                    ...item,
                    unitName: unit.unit.name
                  }))
                )
                .sort((a, b) => new Date(b.invoice.invoiceDate).getTime() - new Date(a.invoice.invoiceDate).getTime())
                .slice(0, 5)
                .map(item => (
                  <div key={item.id} className="border border-gray-200 rounded-md p-3">
                    <div className="flex justify-between">
                      <div>
                        <span className="text-xs text-gray-500">
                          {new Date(item.invoice.invoiceDate).toLocaleDateString("vi-VN")}
                        </span>
                        <p className="font-medium">
                          <Link 
                            to={`/invoices/${item.invoiceId}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {item.invoice.code}
                          </Link>
                        </p>
                        <p className="text-sm text-gray-600">
                          {item.invoice.customerName || "Khách lẻ"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{item.quantity} {item.unitName}</p>
                        <p className="text-sm text-gray-600">
                          {item.unitPrice.toLocaleString("vi-VN")} đ/{item.unitName}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                Chưa có bán hàng
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
