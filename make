#!/bin/bash
rm dist/simply.everything.js
find ./js/ -type f \( -iname "*.js" \) -exec cat {} \;  >> dist/simply.everything.js
