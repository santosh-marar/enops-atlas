export function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const second = 1000;
  const minute = second * 60;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;

  // Short durations (keep original logic)
  if (diffMs < minute) {
    const seconds = Math.floor(diffMs / second);
    return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  }
  if (diffMs < hour) {
    const minutes = Math.floor(diffMs / minute);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (diffMs < week) {
    const days = Math.floor(diffMs / day);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  // For longer durations, use calendar-based calculation
  let years = now.getFullYear() - date.getFullYear();
  let months = now.getMonth() - date.getMonth();
  let days = now.getDate() - date.getDate();

  // Adjust for negative days
  if (days < 0) {
    months--;
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += lastMonth.getDate();
  }

  // Adjust for negative months
  if (months < 0) {
    years--;
    months += 12;
  }

  // Less than 1 month: show weeks and days
  if (years === 0 && months === 0) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    let result = `${weeks} week${weeks === 1 ? "" : "s"}`;
    if (remainingDays > 0) {
      result += ` ${remainingDays} day${remainingDays === 1 ? "" : "s"}`;
    }
    return `${result} ago`;
  }

  // Less than 1 year: show months and days
  if (years === 0) {
    let result = `${months} month${months === 1 ? "" : "s"}`;
    if (days > 0) {
      result += ` ${days} day${days === 1 ? "" : "s"}`;
    }
    return `${result} ago`;
  }

  // 1 year or more: show years and months
  let result = `${years} year${years === 1 ? "" : "s"}`;
  if (months > 0) {
    result += ` ${months} month${months === 1 ? "" : "s"}`;
  }
  return `${result} ago`;
}
