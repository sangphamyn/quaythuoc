import { useState } from "react";
import { json, type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from "@remix-run/node";
import { Form, Link, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { requireAdmin } from "~/utils/session.server";

type Compartment = {
  id: number;
  name: string;
  description: string | null;
  _count: {
    products: number;
  };
};

type Row = {
  id: number;
  name: string;
  description: string | null;
  _count: {
    compartments: number;
  };
  compartments: Compartment[];
};

type Cabinet = {
  id: number;
  name: string;
  description: string | null;
};

type LoaderData = {
  rows: Row[];
  cabinet: Cabinet;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  const cabinetId = parseInt(params.cabinetId as string);

  if (isNaN(cabinetId)) {
    throw new Response("Invalid cabinet ID", { status: 400 });
  }

  // Lấy thông tin tủ
  const cabinet = await db.cabinet.findUnique({
    where: { id: cabinetId },
    select: {
      id: true,
      name: true,
      description: true,
    }
  });

  if (!cabinet) {
    throw new Response("Cabinet not found", { status: 404 });
  }

  // Lấy danh sách hàng trong tủ và số ngăn trong mỗi hàng, kèm theo thông tin về các ngăn
  const rows = await db.row.findMany({
    where: { cabinetId },
    include: {
      _count: {
        select: { compartments: true }
      },
      compartments: {
        select: {
          id: true,
          name: true,
          description: true,
          _count: {
            select: { products: true }
          }
        },
        take: 12 // Giới hạn chỉ lấy tối đa 12 ngăn để hiển thị
      }
    },
    orderBy: { name: "asc" }
  });

  return json<LoaderData>({ rows, cabinet });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  // Kiểm tra quyền admin
  await requireAdmin(request);

  const cabinetId = parseInt(params.cabinetId as string);

  if (isNaN(cabinetId)) {
    throw new Response("Invalid cabinet ID", { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get("_action") as string;

  // Xử lý thêm mới hàng
  if (action === "create") {
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || null;

    if (!name || name.trim() === "") {
      return json({ error: "Tên hàng không được để trống" }, { status: 400 });
    }

    await db.row.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        cabinetId
      }
    });

    return redirect(`/admin/cabinets/${cabinetId}/rows`);
  }

  // Xử lý xóa hàng
  if (action === "delete") {
    const rowId = parseInt(formData.get("rowId") as string);

    // Kiểm tra hàng có chứa ngăn không
    const rowWithCompartments = await db.row.findUnique({
      where: { id: rowId },
      include: { _count: { select: { compartments: true } } }
    });

    if (rowWithCompartments && rowWithCompartments._count.compartments > 0) {
      return json({
        error: "Không thể xóa hàng này vì có ngăn bên trong. Vui lòng xóa hết ngăn trước."
      }, { status: 400 });
    }

    await db.row.delete({
      where: { id: rowId }
    });

    return redirect(`/admin/cabinets/${cabinetId}/rows`);
  }

  // Xử lý cập nhật hàng
  if (action === "update") {
    const rowId = parseInt(formData.get("rowId") as string);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string || null;

    if (!name || name.trim() === "") {
      return json({ error: "Tên hàng không được để trống" }, { status: 400 });
    }

    await db.row.update({
      where: { id: rowId },
      data: {
        name: name.trim(),
        description: description?.trim() || null
      }
    });

    return redirect(`/admin/cabinets/${cabinetId}/rows`);
  }

  return null;
};

export default function CabinetRows() {
  const { rows, cabinet } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSubmitting = navigation.state === "submitting";

  // State declarations
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  
  // Toggle view mode
  const toggleViewMode = () => {
    setViewMode(viewMode === 'table' ? 'card' : 'table');
  };

  // Xử lý xóa hàng
  const handleDeleteRow = (rowId: number) => {
    const formData = new FormData();
    formData.append("_action", "delete");
    formData.append("rowId", rowId.toString());
    submit(formData, { method: "post" });
    setConfirmDelete(null);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center mb-2">
        <Link to="/admin/cabinets" className="text-indigo-600 hover:text-indigo-900 mr-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">
          Tủ: {cabinet.name}
        </h1>
      </div>
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-700">Danh sách hàng</h2>
          {cabinet.description && (
            <p className="text-gray-500 mt-1">{cabinet.description}</p>
          )}
        </div>
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
              setEditingRow(null);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md 
              flex items-center transition-colors duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Thêm hàng mới
          </button>
        </div>
      </div>

      {/* Form thêm mới hàng */}
      {showCreateForm && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Thêm hàng mới</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="create" />
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên hàng <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Nhập tên hàng"
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

      {/* Form chỉnh sửa hàng */}
      {editingRow && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Chỉnh sửa hàng</h2>
          <Form method="post" className="space-y-4">
            <input type="hidden" name="_action" value="update" />
            <input type="hidden" name="rowId" value={editingRow.id} />
            <div>
              <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                Tên hàng <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="edit-name"
                name="name"
                required
                defaultValue={editingRow.name}
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
                defaultValue={editingRow.description || ""}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              ></textarea>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingRow(null)}
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

      {/* Danh sách hàng */}
      {viewMode === 'table' ? (
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tên hàng
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mô tả
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số ngăn
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Số sản phẩm
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                      Chưa có hàng nào trong tủ này. Hãy thêm hàng mới.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    // Tính tổng số sản phẩm trong các ngăn
                    const totalProducts = row.compartments.reduce((sum, compartment) => {
                      return sum + compartment._count.products;
                    }, 0);

                    return (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {row.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {row.description || <span className="text-gray-400 italic">Không có mô tả</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <Link 
                            to={`/admin/cabinets/${cabinet.id}/rows/${row.id}/compartments`}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            {row._count.compartments} ngăn
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="text-gray-600">
                            {totalProducts} sản phẩm
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <Link
                              to={`/admin/cabinets/${cabinet.id}/rows/${row.id}/compartments`}
                              className="text-indigo-600 hover:text-indigo-900 p-2"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                            </Link>
                            <button
                              onClick={() => setEditingRow(row)}
                              className="text-blue-600 hover:text-blue-900 p-2"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => setConfirmDelete(row.id)}
                              className="text-red-600 hover:text-red-900 p-2"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.length === 0 ? (
            <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-lg shadow-md">
              Chưa có hàng nào trong tủ này. Hãy thêm hàng mới.
            </div>
          ) : (
            rows.map((row) => {
              // Tính tổng số sản phẩm trong các ngăn
              const totalProducts = row.compartments.reduce((sum, compartment) => {
                return sum + compartment._count.products;
              }, 0);

              return (
                <div key={row.id} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                  <div className="p-4 border-b">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-medium text-gray-900">{row.name}</h3>
                      <div className="flex">
                        <button
                          onClick={() => setEditingRow(row)}
                          className="text-blue-600 hover:text-blue-900 p-1 mr-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDelete(row.id)}
                          className="text-red-600 hover:text-red-900 p-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {row.description || <span className="text-gray-400 italic">Không có mô tả</span>}
                    </p>
                  </div>
                  
                  {/* Hiển thị mô phỏng trực quan về hàng và ngăn */}
                  <div className="p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-700">Cấu trúc hàng</h4>
                      <div className="flex space-x-2">
                        <span className="text-xs font-medium px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full">
                          {row._count.compartments} ngăn
                        </span>
                        <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                          {totalProducts} sản phẩm
                        </span>
                      </div>
                    </div>
                    <div className="border border-gray-300 rounded-md p-2 bg-white">
                      {/* Mô phỏng trực quan các ngăn trong hàng */}
                      {row._count.compartments === 0 ? (
                        <div className="py-3 text-center text-sm text-gray-500">
                          Chưa có ngăn nào trong hàng này
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 p-2">
                          {/* Hiển thị các ngăn với số lượng sản phẩm trong mỗi ngăn */}
                          {row.compartments.map((compartment) => (
                            <div
                              key={compartment.id}
                              className={`px-2 h-10 flex flex-col items-center justify-center rounded-md
                                ${compartment._count.products > 0 
                                  ? 'bg-blue-50 border border-blue-200' 
                                  : 'bg-gray-50 border border-gray-200'}`}
                              title={`${compartment.name} (${compartment._count.products} sản phẩm)`}
                            >
                              <span className={`text-xs font-medium ${compartment._count.products > 0 ? 'text-blue-800' : 'text-gray-500'}`}>
                                {compartment.name}
                              </span>
                              <span className={`text-xs ${compartment._count.products > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                {compartment._count.products}
                              </span>
                            </div>
                          ))}
                          {row._count.compartments > row.compartments.length && (
                            <div className="w-10 h-10 flex items-center justify-center rounded-md bg-gray-100 border border-gray-300">
                              <span className="text-xs text-gray-600">+{row._count.compartments - row.compartments.length}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gray-50 border-t border-gray-200">
                    <Link
                      to={`/admin/cabinets/${cabinet.id}/rows/${row.id}/compartments`}
                      className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Quản lý ngăn
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Dialog xác nhận xóa */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Xác nhận xóa</h3>
            <p className="text-gray-700 mb-4">
              Bạn có chắc chắn muốn xóa hàng này? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={() => handleDeleteRow(confirmDelete)}
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
