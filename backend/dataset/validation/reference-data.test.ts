// =========================================================================
// KIỂM THỬ XÁC MINH DỮ LIỆU THAM CHIẾU TIẾNG VIỆT (MILESTONE 3 TESTS)
// =========================================================================

import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log('======================================================');
console.log('🧪 BẮT ĐẦU KIỂM ĐỊNH REFERENCE DATA & VIETNAMESE CONTENT (M3)');
console.log('======================================================');

const refDir = path.resolve(__dirname, '../reference-data');
const categoriesPath = path.join(refDir, 'ticket-categories.json');
const contentPath = path.join(refDir, 'vietnamese-content.json');

// 1. Cả hai JSON parse thành công
let categories: any[] = [];
let content: any = {};

runTest('1. Parse thành công hai tệp JSON dữ liệu tham chiếu', () => {
  assert.ok(fs.existsSync(categoriesPath), 'ticket-categories.json phải tồn tại');
  assert.ok(fs.existsSync(contentPath), 'vietnamese-content.json phải tồn tại');

  const rawCat = fs.readFileSync(categoriesPath, 'utf-8');
  const rawContent = fs.readFileSync(contentPath, 'utf-8');

  categories = JSON.parse(rawCat);
  content = JSON.parse(rawContent);

  assert.ok(Array.isArray(categories), 'ticket-categories.json phải là một mảng');
  assert.strictEqual(typeof content, 'object', 'vietnamese-content.json phải là một object');
});

// 2. Ticket categories có 10–15 phần tử
runTest('2. Ticket categories có từ 10 đến 15 phần tử', () => {
  assert.ok(
    categories.length >= 10 && categories.length <= 15,
    `Số lượng categories (${categories.length}) phải nằm trong khoảng [10, 15]`
  );
});

// 3. ID category không trùng
runTest('3. ID của các category là duy nhất', () => {
  const ids = categories.map((c) => c.id);
  const uniqueIds = new Set(ids);
  assert.strictEqual(uniqueIds.size, ids.length, 'ID category không được trùng lặp');
});

// 4. Category name không trùng sau trim, độ dài <= 50 ký tự
runTest('4. Category name không trùng sau khi trim và độ dài <= 50 ký tự', () => {
  const names = categories.map((c) => c.name.trim());
  const uniqueNames = new Set(names);
  assert.strictEqual(uniqueNames.size, names.length, 'Tên category không được trùng sau trim');

  for (const c of categories) {
    assert.ok(c.name.trim().length <= 50, `Tên category "${c.name}" vượt quá 50 ký tự`);
    assert.ok(c.description && c.description.trim().length > 0, `Category "${c.id}" thiếu mô tả`);
    assert.ok(Array.isArray(c.examples) && c.examples.length > 0, `Category "${c.id}" thiếu danh sách ví dụ`);
  }
});

// 5. Tất cả category có ít nhất một tình huống ticket tương ứng
runTest('5. Mọi category đều có kịch bản ticket tương ứng trong content library', () => {
  assert.ok(Array.isArray(content.tickets), 'content.tickets phải là một mảng');
  const categoryIds = new Set(categories.map((c) => c.id));
  const coveredCategories = new Set(content.tickets.map((t: any) => t.category));

  for (const catId of categoryIds) {
    assert.ok(
      coveredCategories.has(catId),
      `Category "${catId}" chưa có kịch bản sự cố nào trong vietnamese-content.json`
    );
    const countForCat = content.tickets.filter((t: any) => t.category === catId).length;
    assert.ok(countForCat >= 5, `Category "${catId}" có ${countForCat} kịch bản (yêu cầu tối thiểu 5)`);
  }
});

// 6. Ticket title và description không rỗng; description nằm trong giới hạn 5–2000 ký tự
runTest('6. Kịch bản ticket có title và description hợp lệ (5 - 2000 ký tự)', () => {
  for (const t of content.tickets) {
    assert.ok(t.title && t.title.trim().length >= 3, `Ticket title quá ngắn: "${t.title}"`);
    assert.ok(
      t.description && t.description.trim().length >= 5 && t.description.trim().length <= 2000,
      `Ticket description nằm ngoài khoảng [5, 2000] ký tự: "${t.title}" (độ dài: ${t.description?.length})`
    );
  }
});

// 7. Feedback tối thiểu 20 mẫu
runTest('7. Số lượng feedback tối thiểu 20 mẫu', () => {
  assert.ok(Array.isArray(content.feedbacks), 'content.feedbacks phải là mảng');
  assert.ok(content.feedbacks.length >= 20, `Feedback có ${content.feedbacks.length} mẫu (yêu cầu >= 20)`);
  for (const f of content.feedbacks) {
    assert.ok(f.title && f.title.trim().length > 0, 'Feedback thiếu title');
    assert.ok(f.content && f.content.trim().length >= 10, 'Feedback content quá ngắn');
  }
});

// 8. Feedback replies tối thiểu 10 mẫu
runTest('8. Số lượng feedback replies tối thiểu 10 mẫu', () => {
  assert.ok(Array.isArray(content.feedbackReplies), 'content.feedbackReplies phải là mảng');
  assert.ok(
    content.feedbackReplies.length >= 10,
    `Feedback replies có ${content.feedbackReplies.length} mẫu (yêu cầu >= 10)`
  );
  for (const r of content.feedbackReplies) {
    assert.ok(r.content && r.content.trim().length >= 10, 'Feedback reply quá ngắn');
  }
});

// 9. Announcements tối thiểu 20 mẫu
runTest('9. Số lượng announcements tối thiểu 20 mẫu', () => {
  assert.ok(Array.isArray(content.announcements), 'content.announcements phải là mảng');
  assert.ok(
    content.announcements.length >= 20,
    `Announcements có ${content.announcements.length} mẫu (yêu cầu >= 20)`
  );
  for (const a of content.announcements) {
    assert.ok(a.title && a.title.trim().length > 0, 'Announcement thiếu title');
    assert.ok(a.content && a.content.trim().length >= 15, 'Announcement content quá ngắn');
    assert.ok(a.topic && a.topic.trim().length > 0, 'Announcement thiếu topic');
  }
});

// 10. Các nhóm dữ liệu không có nội dung trùng nguyên văn
runTest('10. Không có nội dung trùng lặp nguyên văn trong từng nhóm', () => {
  function checkDuplicates(items: string[], groupName: string) {
    const seen = new Set<string>();
    for (const item of items) {
      const normalized = item.trim().toLowerCase();
      assert.ok(!seen.has(normalized), `Phát hiện nội dung trùng lặp trong nhóm ${groupName}: "${item.slice(0, 50)}..."`);
      seen.add(normalized);
    }
  }

  checkDuplicates(content.tickets.map((t: any) => t.title), 'Ticket Titles');
  checkDuplicates(content.tickets.map((t: any) => t.description), 'Ticket Descriptions');
  checkDuplicates(content.feedbacks.map((f: any) => f.title), 'Feedback Titles');
  checkDuplicates(content.feedbacks.map((f: any) => f.content), 'Feedback Contents');
  checkDuplicates(content.feedbackReplies.map((r: any) => r.content), 'Feedback Replies');
  checkDuplicates(content.announcements.map((a: any) => a.title), 'Announcement Titles');
  checkDuplicates(content.announcements.map((a: any) => a.content), 'Announcement Contents');
});

// 11. Không phát hiện placeholder / lorem ipsum hoặc số điện thoại, email cá nhân
runTest('11. Không chứa placeholder (lorem ipsum) hoặc dữ liệu cá nhân (SĐT, Email cá nhân)', () => {
  const allTexts: string[] = [
    ...categories.map((c) => `${c.name} ${c.description} ${c.examples.join(' ')}`),
    ...content.tickets.map((t: any) => `${t.title} ${t.description}`),
    ...content.feedbacks.map((f: any) => `${f.title} ${f.content}`),
    ...content.feedbackReplies.map((r: any) => `${r.title || ''} ${r.content}`),
    ...content.announcements.map((a: any) => `${a.title} ${a.content}`),
  ];

  const fullCorpus = allTexts.join('\n');

  // Kiểm tra lorem ipsum
  assert.ok(!/lorem ipsum|dolor sit amet/i.test(fullCorpus), 'Phát hiện lorem ipsum trong dữ liệu');

  // Kiểm tra số điện thoại Việt Nam (09x, 08x, 03x, 07x, 05x với 10 số)
  assert.ok(!/\b0[35789]\d{8}\b/.test(fullCorpus), 'Phát hiện số điện thoại cá nhân trong dữ liệu');

  // Kiểm tra email
  assert.ok(!/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(fullCorpus), 'Phát hiện email cá nhân trong dữ liệu');
});

console.log('======================================================');
console.log(`🎉 TOÀN BỘ ${passedTests}/${totalTests} TESTS M3 ĐẠT CHUẨN!`);
console.log('======================================================');

