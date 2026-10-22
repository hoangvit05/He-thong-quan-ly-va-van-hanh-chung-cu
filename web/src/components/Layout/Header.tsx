const Header = () => {
  return (
    <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 z-10 relative">
      <div className="text-gray-700 font-medium">
        Hệ thống Quản lý và Vận hành
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
            A
          </div>
          <span className="text-sm font-medium text-gray-700">Admin</span>
        </div>
        <button className="text-sm text-red-600 hover:text-red-800 font-medium transition-colors">
          Đăng xuất
        </button>
      </div>
    </header>
  );
};

export default Header;