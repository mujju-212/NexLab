'use client';

export function NotificationPanel() {
  return (
    <div className="absolute right-4 top-14 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 z-50">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h3 className="font-semibold text-sm">Notifications</h3>
      </div>
      <div className="p-4 text-sm text-gray-500 text-center">No new notifications</div>
    </div>
  );
}
