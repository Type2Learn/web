# Third-party notices — sign-language input foundation

## `kmist70/asl-translator` (MIT)

Type2Learn adapted the public landmark normalisation idea from
[`kmist70/asl-translator`](https://github.com/kmist70/asl-translator): centre
each hand at the wrist, scale it using the wrist-to-middle-MCP distance, then
flatten `21 × xyz` landmarks. Type2Learn independently implemented the code and
adds deterministic left/right slots because detector order alone is not stable.

Copyright (c) 2026 Krishna M

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions: The above copyright notice and this
permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## MediaPipe Tasks Vision (Apache-2.0)

The browser image diagnostic uses MediaPipe Tasks Vision’s Hand Landmarker.
MediaPipe is loaded only at use time and processes images locally. Its task
asset is distributed under the MediaPipe project’s Apache-2.0 licensing.

## `sign-language-translator/sign-language-translator` (Apache-2.0)

This project was reviewed as a PSL data/training ecosystem reference. No code,
weights, or labels from it are bundled in Type2Learn at this stage.
