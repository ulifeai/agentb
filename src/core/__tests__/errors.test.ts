
import {
    ApplicationError,
    ToolNotFoundError,
    LLMError,
    ConfigurationError,
    InvalidStateError,
    StorageError,
    ValidationError,
  } from '../errors';
  
  describe('Core Errors', () => {
    describe('ApplicationError', () => {
      it('should create an instance with message and name', () => {
        const error = new ApplicationError('Test app error');
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error.message).toBe('Test app error');
        expect(error.name).toBe('ApplicationError');
        expect(error.metadata).toBeUndefined();
      });
  
      it('should create an instance with message, name, and metadata', () => {
        const meta = { code: 123, details: 'some details' };
        const error = new ApplicationError('Test app error with meta', meta);
        expect(error.message).toBe('Test app error with meta');
        expect(error.name).toBe('ApplicationError');
        expect(error.metadata).toEqual(meta);
      });
    });
  
    describe('ToolNotFoundError', () => {
      it('should create an instance with default message', () => {
        const error = new ToolNotFoundError('myTool');
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error.message).toBe('Tool "myTool" not found.');
        expect(error.name).toBe('ToolNotFoundError');
        expect(error.metadata).toEqual({ toolName: 'myTool' });
      });
  
      it('should create an instance with custom message', () => {
        const error = new ToolNotFoundError('myTool', 'Custom: Tool not available');
        expect(error.message).toBe('Custom: Tool not available');
        expect(error.metadata).toEqual({ toolName: 'myTool' });
      });
    });
  
    describe('LLMError', () => {
      it('should create an instance with message, errorType, and metadata', () => {
        const meta = { provider: 'openai', attempt: 1 };
        const error = new LLMError('LLM API failed', 'api_error', meta);
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error.message).toBe('LLM API failed');
        expect(error.name).toBe('LLMError');
        expect(error.errorType).toBe('api_error');
        expect(error.metadata).toEqual(meta);
      });
    });
  
    describe('ConfigurationError', () => {
      it('should create an instance correctly', () => {
        const error = new ConfigurationError('Missing API key');
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error.message).toBe('Missing API key');
        expect(error.name).toBe('ConfigurationError');
      });
    });
  
    describe('InvalidStateError', () => {
      it('should create an instance correctly', () => {
        const error = new InvalidStateError('Cannot perform action in current state');
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error.message).toBe('Cannot perform action in current state');
        expect(error.name).toBe('InvalidStateError');
      });
    });
  
    describe('StorageError', () => {
      it('should create an instance correctly', () => {
        const error = new StorageError('Database connection failed');
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error.message).toBe('Database connection failed');
        expect(error.name).toBe('StorageError');
      });
    });
  
    describe('ValidationError', () => {
      it('should create an instance with message and validationDetails', () => {
          const details = { email: "Invalid email format" };
          const error = new ValidationError('Input validation failed', details);
          expect(error).toBeInstanceOf(ApplicationError);
          expect(error.message).toBe('Input validation failed');
          expect(error.name).toBe('ValidationError');
          expect(error.validationDetails).toEqual(details);
      });
    });
  });