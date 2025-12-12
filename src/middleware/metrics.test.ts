// Copyright 2025 John Brosnihan
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// Mock logger
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock metrics service
jest.mock('../services/metrics', () => ({
  recordRequestDuration: jest.fn(),
}));

import { Request, Response, NextFunction } from 'express';
import { metricsMiddleware } from './metrics';
import { recordRequestDuration } from '../services/metrics';

const mockRecordRequestDuration = recordRequestDuration as jest.MockedFunction<typeof recordRequestDuration>;

describe('Metrics Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      method: 'GET',
      path: '/test',
      route: {
        path: '/test',
      } as any,
    };

    mockResponse = {
      statusCode: 200,
      end: jest.fn(),
    };

    nextFunction = jest.fn();
  });

  it('should call next middleware', () => {
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    expect(nextFunction).toHaveBeenCalledTimes(1);
  });

  it('should record request duration when response ends', () => {
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    // Simulate response end
    mockResponse.end!();
    
    expect(mockRecordRequestDuration).toHaveBeenCalledTimes(1);
    expect(mockRecordRequestDuration).toHaveBeenCalledWith(
      'GET',
      '/test',
      200,
      expect.any(Number)
    );
  });

  it('should capture correct HTTP method', () => {
    mockRequest.method = 'POST';
    
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    mockResponse.end!();
    
    expect(mockRecordRequestDuration).toHaveBeenCalledWith(
      'POST',
      expect.any(String),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('should capture correct status code', () => {
    mockResponse.statusCode = 404;
    
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    mockResponse.end!();
    
    expect(mockRecordRequestDuration).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      404,
      expect.any(Number)
    );
  });

  it('should use route path when available', () => {
    mockRequest.route = { path: '/api/test/:id' } as any;
    
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    mockResponse.end!();
    
    expect(mockRecordRequestDuration).toHaveBeenCalledWith(
      expect.any(String),
      '/api/test/:id',
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('should fallback to req.path when route not available', () => {
    mockRequest.route = undefined;
    mockRequest.path = '/fallback/path';
    
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    mockResponse.end!();
    
    expect(mockRecordRequestDuration).toHaveBeenCalledWith(
      expect.any(String),
      '/fallback/path',
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('should measure duration in seconds', () => {
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    // Wait a bit before ending
    setTimeout(() => {
      mockResponse.end!();
      
      const duration = (mockRecordRequestDuration.mock.calls[0] as any)[3];
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1); // Should be less than 1 second for this test
    }, 10);
  });

  it('should handle multiple requests independently', () => {
    const req1 = { 
      ...mockRequest, 
      path: '/test1',
      route: { path: '/test1' } as any 
    } as Request;
    const res1 = { ...mockResponse, statusCode: 200, end: jest.fn() } as Response;
    
    const req2 = { 
      ...mockRequest, 
      path: '/test2',
      route: { path: '/test2' } as any 
    } as Request;
    const res2 = { ...mockResponse, statusCode: 404, end: jest.fn() } as Response;
    
    metricsMiddleware(req1, res1, nextFunction);
    metricsMiddleware(req2, res2, nextFunction);
    
    res1.end!();
    res2.end!();
    
    expect(mockRecordRequestDuration).toHaveBeenCalledTimes(2);
    
    // Verify first request
    expect(mockRecordRequestDuration).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      '/test1',
      200,
      expect.any(Number)
    );
    
    // Verify second request
    expect(mockRecordRequestDuration).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      '/test2',
      404,
      expect.any(Number)
    );
  });

  it('should preserve original end functionality', () => {
    const originalEndMock = jest.fn();
    mockResponse.end = originalEndMock;
    
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    
    const arg1 = 'test data';
    const arg2 = 'utf8';
    mockResponse.end!(arg1, arg2);
    
    // Original end should have been called with arguments
    expect(originalEndMock).toHaveBeenCalledWith(arg1, arg2);
  });

  it('should work with error status codes', () => {
    mockResponse.statusCode = 500;
    
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    mockResponse.end!();
    
    expect(mockRecordRequestDuration).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      500,
      expect.any(Number)
    );
  });

  it('should work with redirect status codes', () => {
    mockResponse.statusCode = 302;
    
    metricsMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    mockResponse.end!();
    
    expect(mockRecordRequestDuration).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      302,
      expect.any(Number)
    );
  });
});
