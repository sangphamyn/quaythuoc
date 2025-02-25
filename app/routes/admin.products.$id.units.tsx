import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { db } from "~/utils/db.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const productId = params.id;
  
  if (!productId || isNaN(Number(productId))) {
    return redirect("/admin/products");
  }
  
  const [product, units] = await Promise.all([
    db.product.findUnique({
      where: { id: Number(productId) },
      include: {
        productUnits: {
          include: {
            unit: true
          }
        }
      }
    }),
    db.unit.findMany({
      orderBy: { name: 'asc' }
    })
  ]);
  
  if (!product) {
    throw new Response("Không tìm thấy sản phẩm", { status: 404 });
  }
  
  // Lấy danh sách ID của các đơn vị đã có trong sản phẩm
  const existingUnitIds = product.productUnits.map(pu => pu.unitId);
  
  // Lọc danh sách đơn vị chưa được thêm vào sản phẩm
  const availableUnits = units.filter(unit => !existingUnitIds.includes(unit.id));
  
  // Tìm đơn vị cơ bản
  const baseUnit = product.productUnits.find(pu => pu.isBaseUnit);
  
  return json({
    product,
    productUnits: product.productUnits,
    availableUnits,
    baseUnit
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const productId = params.id;
  
  if (!productId || isNaN(Number(productId))) {
    return redirect("/admin/products");
  }
  
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  
  // Xử lý thêm đơn vị tính mới
  if (intent === "add-unit") {
    const unitId = formData.get("unitId");
    const conversionFactor = formData.get("conversionFactor");
    const costPrice = formData.get("costPrice");
    const sellingPrice = formData.get("sellingPrice");
    
    // Xác thực dữ liệu
    const errors: Record<string, string> = {};
    
    if (!unitId) {
      errors.unitId = "Đơn vị tính là bắt buộc";
    }
    
    if (!conversionFactor) {
      errors.conversionFactor = "Hệ số quy đổi là bắt buộc";
    } else {
      const factor = parseFloat(conversionFactor.toString());
      if (isNaN(factor) || factor <= 0) {
        errors.conversionFactor = "Hệ số quy đổi phải là số dương";
      }
    }
    
    const costPriceNumber = parseFloat(costPrice?.toString() || "0");
    if (isNaN(costPriceNumber) || costPriceNumber < 0) {
      errors.costPrice = "Giá vốn không hợp lệ";
    }
    
    const sellingPriceNumber = parseFloat(sellingPrice?.toString() || "0");
    if (isNaN(sellingPriceNumber) || sellingPriceNumber < 0) {
      errors.sellingPrice = "Giá bán không hợp lệ";
    }
    
    // Kiểm tra đơn vị đã tồn tại chưa
    if (unitId && !errors.unitId) {
      const existingProductUnit = await db.productUnit.findFirst({
        where: {
          productId: Number(productId),
          unitId: Number(unitId)
        }
      });
      
      if (existingProductUnit) {
        errors.unitId = "Đơn vị này đã được thêm cho sản phẩm";
      }
    }
    
    if (Object.keys(errors).length > 0) {
      return json({
        errors,
        values: {
          unitId: unitId ? Number(unitId) : undefined,
          conversionFactor,
          costPrice,
          sellingPrice
        },
        action: "add-unit"
      });
    }
    
    // Thêm đơn vị mới
    await db.productUnit.create({
      data: {
        productId: Number(productId),
        unitId: Number(unitId),
        conversionFactor: parseFloat(conversionFactor.toString()),
        costPrice: costPriceNumber,
        sellingPrice: sellingPriceNumber,
        isBaseUnit: false // Đơn vị mới không phải đơn vị cơ bản
      }
    });
    
    return redirect(`/admin/products/${productId}/units`);
  }
  
  // Xử lý cập nhật đơn vị tính
  else if (intent === "update-unit") {
    const productUnitId = formData.get("productUnitId");
    const conversionFactor = formData.get("conversionFactor");
    const costPrice = formData.get("costPrice");
    const sellingPrice = formData.get("sellingPrice");
    
    // Xác thực dữ liệu
    const errors: Record<string, string> = {};
    
    if (!conversionFactor) {
      errors.conversionFactor = "Hệ số quy đổi là bắt buộc";
    } else {
      const factor = parseFloat(conversionFactor.toString());
      if (isNaN(factor) || factor <= 0) {
        errors.conversionFactor = "Hệ số quy đổi phải là số dương";
      }
    }
    
    const costPriceNumber = parseFloat(costPrice?.toString() || "0");
    if (isNaN(costPriceNumber) || costPriceNumber < 0) {
      errors.costPrice = "Giá vốn không hợp lệ";
    }
    
    const sellingPriceNumber = parseFloat(sellingPrice?.toString() || "0");
    if (isNaN(sellingPriceNumber) || sellingPriceNumber < 0) {
      errors.sellingPrice = "Giá bán không hợp lệ";
    }
    
    if (Object.keys(errors).length > 0) {
      return json({
        errors,
        values: {
          productUnitId,
          conversionFactor,
          costPrice,
          sellingPrice
        },
        action: "update-unit"
      });
    }
    
    // Cập nhật đơn vị
    await db.productUnit.update({
      where: { id: Number(productUnitId) },
      data: {
        conversionFactor: parseFloat(conversionFactor.toString()),
        costPrice: costPriceNumber,
        sellingPrice: sellingPriceNumber
      }
    });
    
    return redirect(`/admin/products/${productId}/units`);
  }
  
  // Xử lý đặt đơn vị cơ bản
  else if (intent === "set-base-unit") {
    const productUnitId = formData.get("productUnitId");
    
    if (!productUnitId) {
      return redirect(`/admin/products/${productId}/units`);
    }
    
    // Thực hiện trong transaction để đảm bảo tính nhất quán
    await db.$transaction(async (tx) => {
      // Đặt tất cả đơn vị không phải đơn vị cơ bản
      await tx.productUnit.updateMany({
        where: {
          productId: Number(productId)
        },
        data: {
          isBaseUnit: false
        }
      });
      
      // Đặt đơn vị được chọn là đơn vị cơ bản
      await tx.productUnit.update({
        where: { id: Number(productUnitId) },
        data: {
          isBaseUnit: true,
          conversionFactor: 1 // Đơn vị cơ bản luôn có hệ số quy đổi là 1
        }
      });
      
      // Cập nhật baseUnitId của sản phẩm
      const productUnit = await tx.productUnit.findUnique({
        where: { id: Number(productUnitId) }
      });
      
      if (productUnit) {
        await tx.product.update({
          where: { id: Number(productId) },
          data: {
            baseUnitId: productUnit.unitId
          }
        });
      }
    });
    
    return redirect(`/admin/products/${productId}/units`);
  }
  
  // Xử lý xóa đơn vị tính
  else if (intent === "delete-unit") {
    const productUnitId = formData.get("productUnitId");
    
    if (!productUnitId) {
      return redirect(`/admin/products/${productId}/units`);
    }
    
    // Kiểm tra xem có phải đơn vị cơ bản không
    const productUnit = await db.productUnit.findUnique({
      where: { id: Number(productUnitId) }
    });
    
    if (productUnit?.isBaseUnit) {
      return json({
        errors: {
          _form: "Không thể xóa đơn vị cơ bản. Vui lòng đặt đơn vị khác làm đơn vị cơ bản trước."
        },
        action: "delete-unit"
      });
    }
    
    // Kiểm tra xem đơn vị có đang được sử dụng không
    const inventoryCount = await db.inventory.count({
      where: {
        productId: Number(productId),
        productUnitId: Number(productUnitId)
      }
    });
    
    if (inventoryCount > 0) {
      return json({
        errors: {
          _form: "Không thể xóa đơn vị này vì đang có tồn kho sử dụng đơn vị này."
        },
        action: "delete-unit"
      });
    }
    
    // Xóa đơn vị
    await db.productUnit.delete({
      where: { id: Number(productUnitId) }
    });
    
    return redirect(`/admin/products/${productId}/units`);
  }
  
  return redirect(`/admin/products/${productId}/units`);
};

export default function ProductUnits() {
  const { product, productUnits, availableUnits, baseUnit } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);
  
  useEffect(() => {
    // Mở lại modal nếu có lỗi
    if (actionData?.action === "add-unit" && Object.keys(actionData.errors || {}).length > 0) {
      setShowAddModal(true);
    }
    if (actionData?.action === "update-unit" && Object.keys(actionData.errors || {}).length > 0) {
      setShowEditModal(true);
    }
  }, [actionData]);
  
  // Hiển thị modal thêm đơn vị
  const openAddModal = () => {
    setShowAddModal(true);
  };
  
  // Hiển thị modal chỉnh sửa đơn vị
  const openEditModal = (unit: any) => {
    setSelectedUnit(unit);
    setShowEditModal(true);
  };
  
  // Hiển thị modal xóa đơn vị
  const openDeleteModal = (unit: any) => {
    setSelectedUnit(unit);
    setShowDeleteModal(true);
  };
  
  // Đóng tất cả modal
  const closeModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setSelectedUnit(null);
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Quản lý đơn vị tính - {product.name}</h1>
        <div className="flex gap-2">
          <Link
            to={`/admin/products/${product.id}`}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            <span>Quay lại</span>
          </Link>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
            disabled={availableUnits.length === 0}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span>Thêm đơn vị</span>
          </button>
        </div>
      </div>
      
      {actionData?.errors?._form && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-4">
          {actionData.errors._form}
        </div>
      )}
      
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Đơn vị cơ bản hiện tại</h2>
          <div className="flex items-center">
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
              {baseUnit?.unit.name || "Chưa thiết lập"}
            </span>
            <span className="text-sm text-gray-500 ml-3">
              Giá vốn: {baseUnit ? baseUnit.costPrice.toLocaleString("vi-VN") : "—"} đ | 
              Giá bán: {baseUnit ? baseUnit.sellingPrice.toLocaleString("vi-VN") : "—"} đ
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Đơn vị cơ bản luôn có hệ số quy đổi là 1. Các đơn vị khác sẽ quy đổi về đơn vị này.
          </p>
        </div>
        
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
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
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {productUnits.map(unit => (
              <tr key={unit.id} className={`hover:bg-gray-50 ${unit.isBaseUnit ? 'bg-green-50' : ''}`}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {unit.unit.name}
                  {unit.isBaseUnit && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Cơ bản
                    </span>
                  )}
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
                <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-3">
                    {!unit.isBaseUnit && (
                      <Form method="post">
                        <input type="hidden" name="productUnitId" value={unit.id} />
                        <button
                          type="submit"
                          name="intent"
                          value="set-base-unit"
                          className="text-blue-600 hover:text-blue-900"
                          title="Đặt làm đơn vị cơ bản"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </Form>
                    )}
                    <button
                      onClick={() => openEditModal(unit)}
                      className="text-indigo-600 hover:text-indigo-900"
                      title="Chỉnh sửa"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    {!unit.isBaseUnit && (
                      <button
                        onClick={() => openDeleteModal(unit)}
                        className="text-red-600 hover:text-red-900"
                        title="Xóa"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {productUnits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-sm text-gray-500">
                  Sản phẩm chưa có đơn vị tính nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Modal thêm đơn vị */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-md shadow-md max-w-md mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Thêm đơn vị tính</h2>
              <button onClick={closeModals} className="text-gray-500 hover:text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <Form method="post">
              <div className="mb-4">
                <label htmlFor="unitId" className="block text-sm font-medium text-gray-700 mb-1">
                  Đơn vị <span className="text-red-500">*</span>
                </label>
                <select
                  id="unitId"
                  name="unitId"
                  defaultValue={actionData?.values?.unitId || ""}
                  className={`w-full px-3 py-2 border rounded-md appearance-none bg-white ${
                    actionData?.errors?.unitId && actionData.action === "add-unit"
                      ? "border-red-500 focus:outline-red-500"
                      : "border-gray-300 focus:outline-blue-500"
                  }`}
                >
                  <option value="">-- Chọn đơn vị --</option>
                  {availableUnits.map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
                {actionData?.errors?.unitId && actionData.action === "add-unit" && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.unitId}</p>
                )}
              </div>
              
              <div className="mb-4">
                <label htmlFor="conversionFactor" className="block text-sm font-medium text-gray-700 mb-1">
                  Hệ số quy đổi <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="conversionFactor"
                  name="conversionFactor"
                  min="0.001"
                  step="0.001"
                  defaultValue={actionData?.values?.conversionFactor || "1"}
                  className={`w-full px-3 py-2 border rounded-md ${
                    actionData?.errors?.conversionFactor && actionData.action === "add-unit"
                      ? "border-red-500 focus:outline-red-500"
                      : "border-gray-300 focus:outline-blue-500"
                  }`}
                  placeholder="Nhập hệ số quy đổi"
                />
                {actionData?.errors?.conversionFactor && actionData.action === "add-unit" && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.conversionFactor}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Ví dụ: 1 thùng = 12 hộp, hệ số quy đổi là 12
                </p>
              </div>
              
              <div className="mb-4">
                <label htmlFor="costPrice" className="block text-sm font-medium text-gray-700 mb-1">
                  Giá vốn
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="costPrice"
                    name="costPrice"
                    min="0"
                    step="1000"
                    defaultValue={actionData?.values?.costPrice || "0"}
                    className={`w-full px-3 py-2 border rounded-md pr-9 ${
                      actionData?.errors?.costPrice && actionData.action === "add-unit"
                        ? "border-red-500 focus:outline-red-500"
                        : "border-gray-300 focus:outline-blue-500"
                    }`}
                    placeholder="Nhập giá vốn"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">đ</span>
                  </div>
                </div>
                {actionData?.errors?.costPrice && actionData.action === "add-unit" && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.costPrice}</p>
                )}
              </div>
              
              <div className="mb-6">
                <label htmlFor="sellingPrice" className="block text-sm font-medium text-gray-700 mb-1">
                  Giá bán
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="sellingPrice"
                    name="sellingPrice"
                    min="0"
                    step="1000"
                    defaultValue={actionData?.values?.sellingPrice || "0"}
                    className={`w-full px-3 py-2 border rounded-md pr-9 ${
                      actionData?.errors?.sellingPrice && actionData.action === "add-unit"
                        ? "border-red-500 focus:outline-red-500"
                        : "border-gray-300 focus:outline-blue-500"
                    }`}
                    placeholder="Nhập giá bán"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">đ</span>
                  </div>
                </div>
                {actionData?.errors?.sellingPrice && actionData.action === "add-unit" && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.sellingPrice}</p>
                )}
              </div>
              
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="add-unit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Thêm
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
      
      {/* Modal chỉnh sửa đơn vị */}
      {showEditModal && selectedUnit && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-md shadow-md max-w-md mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Chỉnh sửa đơn vị tính</h2>
              <button onClick={closeModals} className="text-gray-500 hover:text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <Form method="post">
              <input type="hidden" name="productUnitId" value={selectedUnit.id} />
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Đơn vị
                </label>
                <div className="px-3 py-2 border border-gray-300 bg-gray-100 rounded-md">
                  {selectedUnit.unit.name}
                  {selectedUnit.isBaseUnit && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Đơn vị cơ bản
                    </span>
                  )}
                </div>
              </div>
              
              <div className="mb-4">
                <label htmlFor="conversionFactor" className="block text-sm font-medium text-gray-700 mb-1">
                  Hệ số quy đổi <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="conversionFactor"
                  name="conversionFactor"
                  min="0.001"
                  step="0.001"
                  defaultValue={
                    actionData?.values?.productUnitId === selectedUnit.id && actionData.action === "update-unit"
                      ? actionData.values.conversionFactor
                      : selectedUnit.conversionFactor
                  }
                  disabled={selectedUnit.isBaseUnit}
                  className={`w-full px-3 py-2 border rounded-md ${
                    actionData?.errors?.conversionFactor && actionData.action === "update-unit"
                      ? "border-red-500 focus:outline-red-500"
                      : "border-gray-300 focus:outline-blue-500"
                  } ${selectedUnit.isBaseUnit ? "bg-gray-100" : ""}`}
                  placeholder="Nhập hệ số quy đổi"
                />
                {actionData?.errors?.conversionFactor && actionData.action === "update-unit" && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.conversionFactor}</p>
                )}
                {selectedUnit.isBaseUnit && (
                  <p className="text-xs text-gray-500 mt-1">
                    Đơn vị cơ bản luôn có hệ số quy đổi là 1
                  </p>
                )}
              </div>
              
              <div className="mb-4">
                <label htmlFor="costPrice" className="block text-sm font-medium text-gray-700 mb-1">
                  Giá vốn
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="costPrice"
                    name="costPrice"
                    min="0"
                    step="1000"
                    defaultValue={
                      actionData?.values?.productUnitId === selectedUnit.id && actionData.action === "update-unit"
                        ? actionData.values.costPrice
                        : selectedUnit.costPrice
                    }
                    className={`w-full px-3 py-2 border rounded-md pr-9 ${
                      actionData?.errors?.costPrice && actionData.action === "update-unit"
                        ? "border-red-500 focus:outline-red-500"
                        : "border-gray-300 focus:outline-blue-500"
                    }`}
                    placeholder="Nhập giá vốn"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">đ</span>
                  </div>
                </div>
                {actionData?.errors?.costPrice && actionData.action === "update-unit" && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.costPrice}</p>
                )}
              </div>
              
              <div className="mb-6">
                <label htmlFor="sellingPrice" className="block text-sm font-medium text-gray-700 mb-1">
                  Giá bán
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="sellingPrice"
                    name="sellingPrice"
                    min="0"
                    step="1000"
                    defaultValue={
                      actionData?.values?.productUnitId === selectedUnit.id && actionData.action === "update-unit"
                        ? actionData.values.sellingPrice
                        : selectedUnit.sellingPrice
                    }
                    className={`w-full px-3 py-2 border rounded-md pr-9 ${
                      actionData?.errors?.sellingPrice && actionData.action === "update-unit"
                        ? "border-red-500 focus:outline-red-500"
                        : "border-gray-300 focus:outline-blue-500"
                    }`}
                    placeholder="Nhập giá bán"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-gray-500">đ</span>
                  </div>
                </div>
                {actionData?.errors?.sellingPrice && actionData.action === "update-unit" && (
                  <p className="text-red-500 text-sm mt-1">{actionData.errors.sellingPrice}</p>
                )}
              </div>
              
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="update-unit"
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Lưu thay đổi
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}
      
      {/* Modal xóa đơn vị */}
      {showDeleteModal && selectedUnit && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-md shadow-md max-w-md mx-auto">
            <h2 className="text-xl font-bold mb-4">Xác nhận xóa</h2>
            <p className="mb-4">
              Bạn có chắc chắn muốn xóa đơn vị "{selectedUnit.unit.name}" khỏi sản phẩm này?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={closeModals}
                className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Hủy
              </button>
              <Form method="post">
                <input type="hidden" name="productUnitId" value={selectedUnit.id} />
                <button
                  type="submit"
                  name="intent"
                  value="delete-unit"
                  className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                >
                  Xóa
                </button>
              </Form>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading indicator */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-25 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-md shadow-md">
            <p className="text-center">Đang xử lý...</p>
          </div>
        </div>
      )}
    </div>
  );
}
