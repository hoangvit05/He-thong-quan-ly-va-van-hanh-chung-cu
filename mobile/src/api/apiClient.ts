import axios from 'axios';

export const apiClient = axios.create({
  baseURL: 'http://localhost:5000', // Đổi IP máy tính khi test trên điện thoại thật
  headers: {
    'Content-Type': 'application/json',
  },
});
