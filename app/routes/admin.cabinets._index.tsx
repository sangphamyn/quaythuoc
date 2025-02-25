import { useState } from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { requireAdmin } from "~/utils/session.server";

type Compartment = {
  id: number;
  name: string;
  _count: {
    products: number;
  };
};

type Cabinet = {
  id: number;
  name: string;
  description: string | null;
  _count: {
    rows: number;
  };
  rows: {
    id: number;
    name: string;
    _count: {
      compartments: number;
    },
    compartments: Compartment[];
  }[];
  totalCompartments: number;
  totalProducts: number;
};

type LoaderData = {
  cabinets: Cabinet[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  // Lấy danh sách tủ và số lượng hàng trong mỗi tủ, kèm theo thông tin về các hàng và ngăn
  const cabinets = await db.cabinet.findMany({
    include: {
      _count: {
        select: { rows: true }
      },
      rows: {
        include: {
          _count: {
            select: { compartments: true }
          },
          compartments: {
            select: {
              id: true,
              name: true,
              _count: {
                select: { products: true }
              }
            },
            take: 12 // Giới hạn chỉ lấy tối đa 12 ngăn để hiển thị
          }
        }
      }
    },
    orderBy: { name: "asc" }
  });

  // Tính tổng số ngăn trong mỗi tủ
  const cabinetsWithCompartmentCounts = cabinets.map(cabinet => {
    const totalCompartments = cabinet.rows.reduce((sum, row) => {
      return sum + row._count.compartments;
    }, 0);
    
    // Tính tổng số sản phẩm trong các ngăn của tủ
    const totalProducts = cabinet.rows.reduce((sum, row) => {
      return sum + row.compartments.reduce((prodSum, comp) => {
        return prodSum + comp._count.products;
      }, 0);
    }, 0);
    
    return {
      ...cabinet,
      totalCompartments,
      totalProducts
    };
  });

  return json<LoaderData>({ cabinets: cabinetsWithCompartmentCounts });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  const formData = await request.formData();
  const action = formData.get("_action") as string;

  // Xử lý thêm mới tủ
  if (action === "create") {
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || null;

    if (!name || name.trim() === "") {
      return json({ error: "Tên tủ không được để trống" }, { status: 400 });
    }

    await db.cabinet.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null
      }
    });

    return redirect("/admin/cabinets");
  }

  // Xử lý xóa tủ
  if (action === "delete") {
    const cabinetId = parseInt(formData.get("cabinetId") as string);

    // Kiểm tra tủ có chứa hàng không
    const cabinetWithRows = await db.cabinet.findUnique({
      where: { id: cabinetId },
      include: { _count: { select: { rows: true } } }
    });

    if (cabinetWithRows && cabinetWithRows._count.rows > 0) {
      return json({
        error: "Không thể xóa tủ này vì có hàng bên trong. Vui lòng xóa hết hàng trước."
      }, { status: 400 });
    }

    await db.cabinet.delete({
      where: { id: cabinetId }
    });

    return redirect("/admin/cabinets");
  }

  // Xử lý cập nhật tủ
  if (action === "update") {
    const cabinetId = parseInt(formData.get("cabinetId") as string);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || null;

    if (!name || name.trim() === "") {
      return json({ error: "Tên tủ không được để trống" }, { status: 400 });
    }

    await db.cabinet.update({
      where: { id: cabinetId },
      data: {
        name: name.trim(),
        description: description?.trim() || null
      }
    });

    return redirect("/admin/cabinets");
  }

  return null;
};

export default function Cabinets() {
  const { cabinets } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  // State declarations
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCabinet, setEditingCabinet] = useState<Cabinet | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Toggle view mode
  const toggleViewMode = () => {
    setViewMode(viewMode === 'table' ? 'card' : 'table');
  };

  // Xử lý xóa tủ
  const handleDeleteCabinet = (cabinetId: number) => {
    const formData = new FormData();
    formData.append("_action", "delete");
    formData.append("cabinetId", cabinetId.toString());
    submit(formData, { method: "post" });
    setConfirmDelete(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Quản lý tủ hàng</h1>
        <div className="flex space-x-2">
          <button
            onClick={toggleViewMode}
            className="bg-white text-gray-600 hover:text-indigo-600 p-2 rounded-md border border-gray-300 
              flex items-center transition-colors duration-200"
            title={viewMode === 'table' ? "Chuyển sang chế độ xem thẻ" : "Chuyển sang chế độ xem bảng"}
          >
            {viewMode === 'table' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <button
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setEditingCabinet(null);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md 
              flex items-center transition-colors duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Thêm tủ mới
          </button>
        </div>
      </div>

      {/* Form thêm mới tủ */}
      {showCreateForm && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Thêm tủ mới</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="create" />
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên tủ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Nhập tên tủ"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Mô tả
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Nhập mô tả (không bắt buộc)"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isSubmitting ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Form chỉnh sửa tủ */}
      {editingCabinet && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Chỉnh sửa tủ</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="update" />
            <input type="hidden" name="cabinetId" value={editingCabinet.id} />
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên tủ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="edit-name"
                name="name"
                required
                defaultValue={editingCabinet.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-1">
                Mô tả
              </label>
              <textarea
                id="edit-description"
                name="description"
                rows={3}
                defaultValue={editingCabinet.description || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingCabinet(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Danh sách tủ */}
      {viewMode === 'table' ? (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    STT
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tên tủ
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mô tả
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số hàng
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số ngăn
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cabinets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                      Chưa có tủ nào. Hãy thêm tủ mới.
                    </td>
                  </tr>
                ) : (
                  cabinets.map((cabinet,index) => (
                    <tr key={cabinet.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {index+1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <Link 
                          to={`/admin/cabinets/${cabinet.id}/rows`}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          {cabinet.name}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {cabinet.description || <span className="text-gray-400 italic">Không có mô tả</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <Link 
                          to={`/admin/cabinets/${cabinet.id}/rows`}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          {cabinet._count.rows} hàng
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {cabinet.totalCompartments} ngăn
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => setEditingCabinet(cabinet)}
                            className="text-blue-600 hover:text-blue-900 p-2"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setConfirmDelete(cabinet.id)}
                            className="text-red-600 hover:text-red-900 p-2"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cabinets.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-lg shadow-md">
              Chưa có tủ nào. Hãy thêm tủ mới.
            </div>
          ) : (
            cabinets.map((cabinet) => (
              <div key={cabinet.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="p-4 border-b">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-medium text-gray-900">{cabinet.name}</h3>
                    <div className="flex">
                      <button
                        onClick={() => setEditingCabinet(cabinet)}
                        className="text-blue-600 hover:text-blue-900 p-1 mr-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDelete(cabinet.id)}
                        className="text-red-600 hover:text-red-900 p-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {cabinet.description || <span className="text-gray-400 italic">Không có mô tả</span>}
                  </p>
                </div>
                
                {/* Hiển thị mô phỏng trực quan về tủ và hàng */}
                <div className="p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">Cấu trúc tủ</h4>
                    <div className="flex space-x-2">
                      <span className="text-xs font-medium px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full">
                        {cabinet._count.rows} hàng
                      </span>
                      <span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-800 rounded-full">
                        {cabinet.totalCompartments} ngăn
                      </span>
                      <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                        {cabinet.totalProducts} SP
                      </span>
                    </div>
                  </div>
                  <div className="border border-gray-300 rounded-md p-2 bg-white">
                    {/* Mô phỏng trực quan các hàng và ngăn trong tủ */}
                    {cabinet._count.rows === 0 ? (
                      <div className="py-3 text-center text-sm text-gray-500">
                        Chưa có hàng nào trong tủ này
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Hiển thị các hàng và ngăn */}
                        {cabinet.rows.slice(0, 3).map((row, rowIndex) => (
                          <div key={row.id} className="space-y-1">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center">
                                <div className="w-3 h-3 rounded-full bg-indigo-400 mr-2"></div>
                                <span className="text-xs font-medium text-gray-700">{row.name}</span>
                              </div>
                              <span className="text-xs text-gray-500">{row._count.compartments} ngăn</span>
                            </div>
                            
                            {/* Hiển thị các ngăn trong hàng */}
                            <div className="flex flex-wrap gap-1 ml-5">
                              {row.compartments.length > 0 ? (
                                <>
                                  {row.compartments.slice(0, 8).map((compartment) => (
                                    <div
                                      key={compartment.id}
                                      className={`w-6 h-6 rounded-sm flex items-center justify-center text-xs
                                        ${compartment._count.products > 0 
                                          ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                                          : 'bg-gray-100 text-gray-600 border border-gray-300'}`}
                                      title={`${compartment.name} (${compartment._count.products} sản phẩm)`}
                                    >
                                      {compartment._count.products}
                                    </div>
                                  ))}
                                  {row.compartments.length > 8 && (
                                    <div className="w-6 h-6 rounded-sm flex items-center justify-center text-xs bg-gray-200 text-gray-700 border border-gray-300">
                                      +{row._count.compartments - 8}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs text-gray-500">Chưa có ngăn</span>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {cabinet._count.rows > 3 && (
                          <div className="text-center text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                            +{cabinet._count.rows - 3} hàng khác
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <Link
                    to={`/admin/cabinets/${cabinet.id}/rows`}
                    className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Quản lý hàng
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Dialog xác nhận xóa */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Xác nhận xóa</h3>
            <p className="text-gray-700 mb-4">
              Bạn có chắc chắn muốn xóa tủ này? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={() => handleDeleteCabinet(confirmDelete)}
                className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
