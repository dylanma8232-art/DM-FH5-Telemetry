import os
import re
import json
import urllib.request
import urllib.error

def call_qwen_api(prompt, code):
    api_key = os.environ.get('DASHSCOPE_API_KEY')
    if not api_key:
        print("Warning: DASHSCOPE_API_KEY is not set. Skipping AI optimization.")
        return code

    url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }

    data = {
        "model": "qwen-max",
        "input": {
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert software engineer. Your task is to resolve TODOs and optimize the performance of the provided code. Return only the optimized code without any markdown formatting or explanations."
                },
                {
                    "role": "user",
                    "content": f"{prompt}\n\nCode:\n```javascript\n{code}\n```"
                }
            ]
        },
        "parameters": {
            "result_format": "message"
        }
    }

    try:
        req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers)
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            output_code = result['output']['choices'][0]['message']['content']
            # Clean up markdown formatting if any
            output_code = re.sub(r'^```[a-z]*\n', '', output_code, flags=re.MULTILINE)
            output_code = re.sub(r'```$', '', output_code, flags=re.MULTILINE)
            return output_code.strip()
    except Exception as e:
        print(f"Error calling Qwen API: {e}")
        return code

def process_file(filepath):
    print(f"Processing: {filepath}")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Look for TODOs or simple performance patterns to optimize
    # For a real implementation, we could send the whole file or chunks.
    # Here we send files containing 'TODO' or 'console.log' in performance-critical sections (just as an example heuristic)
    if 'TODO' in content or 'for (' in content or '.map(' in content:
        optimized_content = call_qwen_api("Please resolve any TODOs and optimize this code for performance.", content)
        if optimized_content and optimized_content != content:
            print(f"Optimized {filepath}")
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(optimized_content)

def scan_directory(directory):
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.js') or file.endswith('.jsx') or file.endswith('.ts') or file.endswith('.tsx'):
                process_file(os.path.join(root, file))

if __name__ == '__main__':
    scan_directory('forza-telemetry/client/src')
    scan_directory('forza-telemetry/server/src')
