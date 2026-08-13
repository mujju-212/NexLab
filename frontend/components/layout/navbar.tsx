'use client';

export function Navbar() {
  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        {/* Breadcrumb or page title can go here */}
      </div>
      <div className="flex items-center gap-4">
        {/* NotificationPanel, user avatar, etc. */}
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
          U
        </div>
      </div>
    </header>
  );
}
